import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpIcon } from "@/components/icons/arrow-up";
import { getAuthToken } from "@/lib/auth-client";
import { AI_API_BASE } from "@/lib/constants";
import { useEditor } from "novel";
import { CheckIcon, XIcon } from "lucide-react";
import { markdownToProsemirror } from "@/lib/markdown-to-prosemirror";
import { DOMSerializer } from "prosemirror-model";
import TurndownService from "turndown";
import { agentDecorationKey } from "@/extensions/AgentDecoration";
import { fetchWithRetry, readStreamWithTimeout, validateAgentResponse } from "@/lib/agent-guard";
import { ThreeDot } from "react-loading-indicators";
import BorderGlow from "@/components/ui/BorderGlow";
import ShinyText from "@/components/ui/ShinyText";

// --- Types ---

interface AgentChange {
  blockId: string;
  content: string;
}

interface BlockPosition {
  from: number;
  to: number;
}

// --- Helpers ---

/**
 * Serialize the entire editor document into Markdown with «bN» block markers.
 * Returns the markdown string and a map of blockId → ProseMirror positions.
 */
function serializeWithBlockIds(editor: ReturnType<typeof useEditor>["editor"]): {
  markdown: string;
  blockMap: Map<string, BlockPosition>;
} {
  if (!editor || !editor.state) return { markdown: "", blockMap: new Map() };

  const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
  turndown.escape = (text) => text;

  const blockMap = new Map<string, BlockPosition>();
  const lines: string[] = [];
  let idx = 0;

  try {
    const serializer = DOMSerializer.fromSchema(editor.schema);

    editor.state.doc.forEach((node, offset) => {
      const blockId = `b${idx}`;

      // Protect media nodes: skip sending them to the AI to prevent transcript leaks and hallucinated edits.
      // We still increment idx to maintain 1:1 mapping with applyChanges logic.
      if (node.type.name === "audioNode" || node.type.name === "videoNode") {
        blockMap.set(blockId, { from: offset, to: offset + node.nodeSize });
        idx++;
        return;
      }

      let md = "";

      try {
        const dom = serializer.serializeNode(node);
        const wrapper = document.createElement("div");
        wrapper.appendChild(dom);
        md = turndown.turndown(wrapper.innerHTML).trim();
      } catch {
        // Fallback for custom nodes
        md = node.textContent || "";
      }

      lines.push(`«${blockId}» ${md || "[empty]"}`);
      blockMap.set(blockId, { from: offset, to: offset + node.nodeSize });
      idx++;
    });
  } catch (err) {
    // Ultimate fallback: convert entire HTML to markdown without block IDs
    console.error("[Agent] Block serialization failed, using full-doc fallback:", err);
    const fullMd = turndown.turndown(editor.getHTML()).trim();
    return { markdown: `«b0» ${fullMd || "(Document is empty)"}`, blockMap };
  }

  return { markdown: lines.join("\n\n"), blockMap };
}

/**
 * Parse AI response text into structured block changes.
 * Handles multi-line blocks (lists, tables, etc.)
 */
function parseAgentResponse(text: string): AgentChange[] {
  const changes: AgentChange[] = [];
  const lines = text.split("\n");
  let current: { id: string; lines: string[] } | null = null;

  // Strip stray guillemet characters that AI may hallucinate
  const cleanLine = (s: string) => s.replace(/[«»]/g, "");

  for (const line of lines) {
    const trimmedLine = line.trim();
    const match = trimmedLine.match(/^«(b\d+|new|replace_all|title)»\s*(.*)/i);
    if (match) {
      if (current) {
        changes.push({ blockId: current.id, content: current.lines.join("\n").trim() });
      }
      current = { id: match[1], lines: match[2] ? [cleanLine(match[2])] : [] };
    } else if (current) {
      current.lines.push(cleanLine(line));
    }
  }
  if (current) {
    changes.push({ blockId: current.id, content: current.lines.join("\n").trim() });
  }

  return changes;
}



/**
 * Convert markdown string to ProseMirror JSON node array.
 * Returns the content array from the generated doc, or a fallback paragraph.
 */
function parseMarkdownToNodes(md: string): any[] {
  if (!md) return [];
  try {
    const jsonStr = markdownToProsemirror(md.trim());
    const json = JSON.parse(jsonStr);
    if (json.content && Array.isArray(json.content) && json.content.length > 0) {
      return json.content;
    }
    // Fallback: wrap as paragraph
    return [{ type: "paragraph", content: [{ type: "text", text: md.trim() }] }];
  } catch {
    return [{ type: "paragraph", content: [{ type: "text", text: md.trim() }] }];
  }
}


/**
 * Extract image URL from agent text response if it contains a generated image.
 * Supports Markdown ![Description](URL), custom <image>URL</image>, <img>, and raw S3 URLs.
 */
function extractImageUrl(text: string): string | null {
  if (!text) return null;
  const trimmed = text.trim();

  // 1. Check custom <image>URL</image> or <image>URL
  const customTagMatch = trimmed.match(/<image>\s*(https?:\/\/[^\s<>]+)\s*(<\/image>)?/i);
  if (customTagMatch) return customTagMatch[1];

  // 2. Check Markdown syntax: ![alt](URL)
  const markdownMatch = trimmed.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/i);
  if (markdownMatch) return markdownMatch[1];

  // 3. Check HTML img tag: <img src="URL" ...>
  const imgTagMatch = trimmed.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
  if (imgTagMatch) return imgTagMatch[1];

  // 4. Check raw S3 / blacknote-images URL
  const rawUrlMatch = trimmed.match(/(https?:\/\/[^\s]+?blacknote-images[^\s]+)/i)
    || trimmed.match(/(https?:\/\/[^\s]+?s3\.[^\s]+)/i);
  if (rawUrlMatch) return rawUrlMatch[1];

  return null;
}


/**
 * Apply AI changes using a safe setContent approach.
 * Builds the complete new document JSON by swapping changed blocks,
 * then applies it as a single atomic operation — avoids ProseMirror state corruption.
 */
function applyChanges(
  editor: ReturnType<typeof useEditor>["editor"],
  blockMap: Map<string, BlockPosition>,
  changes: AgentChange[],
  noteId?: string,
  onTitleChange?: (id: string, title: string) => void
) {
  if (!editor) return;

  const docJson = editor.getJSON();
  if (!docJson.content) return;

  // --- Handle Title Change ---
  const titleChange = changes.find((c) => c.blockId === "title");
  if (titleChange && noteId && onTitleChange) {
    onTitleChange(noteId, titleChange.content.trim());
  }

  // --- Handle Full Rewrite ---
  const replaceAllChange = changes.find((c) => c.blockId === "replace_all");
  if (replaceAllChange) {
    const parsedNodes = parseMarkdownToNodes(replaceAllChange.content);
    editor.commands.setContent({ type: "doc", content: parsedNodes });

    const decorationRanges: { from: number, to: number }[] = [];
    editor.state.doc.forEach((node, offset) => {
      decorationRanges.push({ from: offset, to: offset + node.nodeSize });
    });
    if (decorationRanges.length > 0) {
      editor.view.dispatch(editor.state.tr.setMeta(agentDecorationKey, { add: decorationRanges }));
    }
    requestAnimationFrame(() => {
      try {
        const domPos = editor.view.domAtPos(1);
        const targetEl = domPos.node instanceof HTMLElement ? domPos.node : domPos.node.parentElement;
        targetEl?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch { }
    });
    return;
  }
  // ---------------------------

  const changeMap = new Map(changes.map((c) => [c.blockId, c]));

  // Track which output block indices were modified for highlighting later
  const modifiedIndices = new Set<number>();
  const newContent: any[] = [];
  let outputIdx = 0;

  // Rebuild document: replace changed blocks, keep unchanged ones
  docJson.content.forEach((node, idx) => {
    const blockId = `b${idx}`;
    const change = changeMap.get(blockId);

    if (change) {
      if (/\[DELETE\]/i.test(change.content.replace(/[*_`~]/g, "").trim())) {
        // Skip this block — effectively deletes it
        return;
      }
      // Replace with AI-generated content
      const parsedNodes = parseMarkdownToNodes(change.content);
      for (const pNode of parsedNodes) {
        newContent.push(pNode);
        modifiedIndices.add(outputIdx);
        outputIdx++;
      }
    } else {
      // Unchanged — keep original
      newContent.push(node);
      outputIdx++;
    }
  });

  // Append new blocks
  const newBlocks = changes.filter((c) => c.blockId === "new");
  for (const block of newBlocks) {
    const parsedNodes = parseMarkdownToNodes(block.content);
    for (const pNode of parsedNodes) {
      newContent.push(pNode);
      modifiedIndices.add(outputIdx);
      outputIdx++;
    }
  }

  // Single atomic setContent — no position drift, no state corruption
  editor.commands.setContent({ type: "doc", content: newContent });

  // Highlight the modified blocks using fake decorations and scroll to the first one
  let hlIdx = 0;
  let firstModifiedPos = -1;
  const decorationRanges: { from: number, to: number }[] = [];

  editor.state.doc.forEach((node, offset) => {
    if (modifiedIndices.has(hlIdx)) {
      decorationRanges.push({ from: offset, to: offset + node.nodeSize });
      if (firstModifiedPos === -1) firstModifiedPos = offset;
    }
    hlIdx++;
  });

  if (decorationRanges.length > 0) {
    editor.view.dispatch(editor.state.tr.setMeta(agentDecorationKey, { add: decorationRanges }));
  }

  // Smooth scroll to the first changed block
  if (firstModifiedPos >= 0) {
    requestAnimationFrame(() => {
      try {
        const domPos = editor.view.domAtPos(firstModifiedPos + 1);
        const targetEl = domPos.node instanceof HTMLElement
          ? domPos.node
          : domPos.node.parentElement;
        targetEl?.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch { }
    });
  }
}

// --- Component ---
export function AgentInput({
  noteId,
  noteTitle,
  onContentChange,
  onTitleChange
}: {
  noteId?: string;
  noteTitle?: string;
  onContentChange?: (id: string, content: string) => void;
  onTitleChange?: (id: string, title: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localInput, setLocalInput] = useState("");
  const [agentMessage, setAgentMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasPendingModifications, setHasPendingModifications] = useState(false);
  const [changeCount, setChangeCount] = useState<number>(0);
  const [loadingDots, setLoadingDots] = useState("");
  const [isHidden, setIsHidden] = useState(() => localStorage.getItem("blacknote_hide_agent") === "true");
  const [clarifications, setClarifications] = useState<string[]>([]);

  const snapshotRef = useRef<any>(null);
  const snapshotTitleRef = useRef<string | null>(null);
  const blockMapRef = useRef<Map<string, BlockPosition>>(new Map());
  const busyRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasOpenedRef = useRef(false);

  const { editor } = useEditor();
  const editorRef = useRef(editor);
  editorRef.current = editor;

  // --- Event listeners ---

  useEffect(() => {
    const handleVisibility = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setIsHidden(!detail);
    };
    window.addEventListener("blacknote_agent_visibility", handleVisibility);
    return () => window.removeEventListener("blacknote_agent_visibility", handleVisibility);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setIsExpanded((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = (e: Event) => {
      if (containerRef.current?.contains(e.target as Node)) return;

      if (isExpanded && !localInput.trim() && !busyRef.current && document.activeElement !== inputRef.current) {
        setIsExpanded(false);
      }
    };
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [isExpanded, localInput]);

  // Auto-expand if the note is empty
  useEffect(() => {
    if (!editor) return;
    const checkEmpty = () => {
      if (editor.isEmpty) setIsExpanded(true);
    };
    checkEmpty();
    editor.on("update", checkEmpty);
    return () => { editor.off("update", checkEmpty); };
  }, [editor]);

  // Collapse when editor is focused
  useEffect(() => {
    if (!editor) return;
    const handleFocus = () => {
      if (isExpanded && !localInput.trim() && !busyRef.current) {
        setIsExpanded(false);
      }
    };
    editor.on("focus", handleFocus);
    return () => { editor.off("focus", handleFocus); };
  }, [editor, isExpanded, localInput]);

  // Keep busyRef in sync
  useEffect(() => {
    busyRef.current = isProcessing || hasPendingModifications;
  }, [isProcessing, hasPendingModifications]);

  // Animate loading dots
  useEffect(() => {
    if (!isProcessing) { setLoadingDots(""); return; }
    const interval = setInterval(() => {
      setLoadingDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 400);
    return () => clearInterval(interval);
  }, [isProcessing]);

  // Focus management on expand
  useEffect(() => {
    if (isExpanded && !hasOpenedRef.current) {
      setAgentMessage(null);
      setHasPendingModifications(false);
      snapshotRef.current = null;
      hasOpenedRef.current = true;
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    if (!isExpanded) hasOpenedRef.current = false;
  }, [isExpanded]);

  // --- Pre-fetch: serialize document on expand (Factor 13) ---
  const prefetchedRef = useRef<{ markdown: string; blockMap: Map<string, BlockPosition> } | null>(null);

  useEffect(() => {
    if (!isExpanded || !editor || !editor.state) return;

    // Pre-serialize so handleSubmit can skip the expensive step
    const { markdown, blockMap } = serializeWithBlockIds(editor);
    prefetchedRef.current = { markdown, blockMap };

    // Invalidate cache when document changes while input is open
    const handleUpdate = () => {
      prefetchedRef.current = null;
    };
    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
    };
  }, [isExpanded, editor]);

  // --- Core: Send instruction to AI ---

  const handleSubmit = useCallback(async () => {
    if (!localInput.trim() || isProcessing) return;

    const token = await getAuthToken();
    if (!token) {
      window.dispatchEvent(new CustomEvent("ai-error"));
      return;
    }

    const ed = editorRef.current;
    if (!ed || !ed.state) return;

    // Take a snapshot for Reject functionality
    snapshotRef.current = ed.getJSON();
    snapshotTitleRef.current = noteTitle || null;

    // Serialize document with block IDs (use pre-fetched if available)
    const prefetched = prefetchedRef.current;
    const { markdown, blockMap } = prefetched || serializeWithBlockIds(ed);
    blockMapRef.current = blockMap;
    prefetchedRef.current = null; // Consume the cache

    const instruction = localInput;
    setLocalInput("");
    setIsProcessing(true);
    setAgentMessage(null);

    try {
      const response = await fetchWithRetry(
        `${AI_API_BASE}/api/ai/agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ markdown, instruction, title: noteTitle }),
        },
        { maxAttempts: 2 }
      );

      if (!response.ok) {
        if ([401, 402, 429].includes(response.status)) {
          window.dispatchEvent(new CustomEvent("ai-error"));
        }
        throw new Error(`HTTP ${response.status}`);
      }

      // Read with timeout protection (Factor 9: Self-Healing)
      const fullText = await readStreamWithTimeout(response, 30000);

      // Validate before applying (Factor 7: Compact Errors into Context)
      const validation = validateAgentResponse(fullText, blockMap.size);
      if (validation.issues.length > 0) {
        console.warn("[Agent Guard] Issues:", validation.issues);
      }

      // Handle clarification request (Factor 11: Human-in-the-Loop)
      if (fullText.startsWith("«clarify»")) {
        try {
          const payload = JSON.parse(fullText.slice("«clarify»".length));
          setAgentMessage(payload.reason || "Could you clarify your instruction?");
          setClarifications(payload.suggestions || []);
        } catch {
          setAgentMessage(fullText.slice("«clarify»".length));
        }
        snapshotRef.current = null;
        setIsProcessing(false);
        return;
      }
      setClarifications([]); // Clear any previous clarifications

      // Strip out any <think> tags and their contents
      const cleanText = fullText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

      // Check if the response contains a generated image URL
      const imageUrl = extractImageUrl(cleanText);

      if (imageUrl && ed) {
        // Handle image generation: auto-insert image directly at cursor position
        try {
          // Check if image is already present in editor to avoid duplicates
          const currentHtml = ed.getHTML();
          if (!currentHtml.includes(imageUrl)) {
            ed.chain().focus().setImage({ src: imageUrl }).run();
            console.log(`[Agent] Auto-inserted generated image at cursor: ${imageUrl}`);
          }
        } catch (err) {
          console.error("[Agent] Failed to auto-insert image:", err);
        }

        // Set the agent message to the formatted image tag so preview UI renders it
        setAgentMessage(`<image>${imageUrl}</image>`);
        setHasPendingModifications(false);
        snapshotRef.current = null;
      } else {
        // Normal text or block-based document changes
        const changes = parseAgentResponse(cleanText);

        if (changes.length > 0) {
          applyChanges(ed, blockMap, changes, noteId, onTitleChange);
          setHasPendingModifications(true);
          setChangeCount(changes.length);
        } else {
          // No block markers → AI answered a general question
          setAgentMessage(cleanText || validation.suggestion || null);
          snapshotRef.current = null;
        }
      }
    } catch (err) {
      console.error("[Agent] Error:", err);
      const message = (err as Error)?.message || "";
      if (message.includes("timeout")) {
        setAgentMessage("The AI took too long to respond. Please try again.");
      } else if (message.includes("429")) {
        setAgentMessage("Too many requests. Please wait a moment and try again.");
      } else {
        setAgentMessage("Failed to process. Please try again.");
      }
      snapshotRef.current = null;
    } finally {
      setIsProcessing(false);
    }
  }, [localInput, isProcessing]);

  // --- Accept / Reject ---

  const acceptAll = useCallback(() => {
    if (!editor || !editor.state) return;
    editor.view.dispatch(editor.state.tr.setMeta(agentDecorationKey, { clear: true }));

    // Force an update to ensure onUpdate triggers save
    editor.chain().focus().run();

    // Explicitly trigger parent's save callback to be safe
    if (noteId && onContentChange) {
      onContentChange(noteId, JSON.stringify(editor.getJSON()));
    }

    setHasPendingModifications(false);
    snapshotRef.current = null;
    setAgentMessage(null);
  }, [editor]);

  const rejectAll = useCallback(() => {
    if (!editor || !editor.state || !snapshotRef.current) return;
    editor.commands.setContent(snapshotRef.current);

    // Revert title if needed
    if (noteId && onTitleChange && snapshotTitleRef.current !== null) {
      onTitleChange(noteId, snapshotTitleRef.current);
    }

    editor.view.dispatch(editor.state.tr.setMeta(agentDecorationKey, { clear: true }));
    setHasPendingModifications(false);
    snapshotRef.current = null;
    snapshotTitleRef.current = null;
    setAgentMessage(null);
  }, [editor, noteId, onTitleChange]);

  useEffect(() => {
    return () => {
      if (editor && editor.view && !editor.isDestroyed) {
        editor.view.dispatch(editor.state.tr.setMeta(agentDecorationKey, { clear: true }));
      }
    };
  }, [editor]);

  if (!editor || isHidden) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-x-0 z-50 flex flex-col items-center justify-end pointer-events-none px-4 transition-all duration-300 gap-1.5"
      style={{ bottom: "5px" }}
    >
      {isExpanded ? (
        <BorderGlow
          className="pointer-events-auto w-full max-w-[600px] flex flex-col overflow-visible transition-all duration-300 ease-out"
          borderRadius={agentMessage ? 18 : 32}
          backgroundColor="hsl(var(--sidebar-bg))"
          glowColor="40 80 80"
          glowRadius={40}
          glowIntensity={1}
          colors={['#c084fc', '#f472b6', '#38bdf8']}
        >
          <div className="relative z-10 flex flex-col items-center justify-center w-full h-full">
            <div className="flex flex-col w-full h-full animate-in fade-in duration-300">
              {/* Agent Message Area */}
              {agentMessage && !isProcessing && !hasPendingModifications && (() => {
                const isImageResponse = agentMessage.trim().startsWith("<image>");
                const imageUrl = isImageResponse 
                   ? agentMessage.replace("<image>", "").replace("</image>", "").trim() 
                  : "";
 
                return isImageResponse ? (
                  <div className="flex flex-col items-center justify-center p-5 gap-4 w-full pointer-events-auto">
                    <div className="relative group max-w-full rounded-2xl overflow-hidden border border-border bg-muted/40 shadow-inner">
                      <img
                        src={imageUrl}
                        alt="AI Generated"
                        className="max-h-[240px] w-auto object-contain rounded-2xl select-none"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            const link = document.createElement("a");
                            link.href = imageUrl;
                            link.download = "ai-generated-image.png";
                            link.target = "_blank";
                            link.click();
                          }}
                          className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors cursor-pointer"
                          title="Download Image"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 w-full max-w-[320px]">
                      <div className="flex-1 flex items-center justify-center gap-2 text-xs font-semibold py-2.5 px-4 bg-green-600/10 dark:bg-green-500/10 text-green-600 dark:text-green-400 rounded-xl border border-green-500/20 select-none">
                        <svg className="w-4 h-4 animate-in zoom-in duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        Inserted into Note
                      </div>
                      <button
                        type="button"
                        onClick={() => setAgentMessage(null)}
                        className="px-4 py-2.5 text-xs font-semibold bg-muted hover:bg-muted/80 text-muted-foreground rounded-xl transition-all cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className="px-5 py-4 text-[14px] text-foreground leading-relaxed max-h-[350px] overflow-y-auto custom-scrollbar whitespace-pre-wrap pointer-events-auto"
                      onScroll={(e) => e.stopPropagation()}
                    >
                      {agentMessage}
                    </div>
                    {clarifications.length > 0 && (
                      <div className="px-4 pb-3 flex flex-wrap gap-1.5 pointer-events-auto">
                        {clarifications.map((suggestion, idx) => (
                          <motion.button
                            key={idx}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.08 }}
                            className="px-3 py-1.5 text-xs rounded-full bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 transition-all cursor-pointer border border-primary/20"
                            onClick={() => {
                              setLocalInput(suggestion);
                              setClarifications([]);
                              setAgentMessage(null);
                              // Auto-submit after a tick to let state update
                              setTimeout(() => {
                                inputRef.current?.form?.requestSubmit?.();
                              }, 50);
                            }}
                          >
                            {suggestion}
                          </motion.button>
                        ))}
                      </div>
                    )}
                    <div className="h-[1px] w-full bg-border" />
                  </>
                );
              })()}
 
              {/* Loading State */}
              {isProcessing ? (
                <div className="px-5 py-3 flex items-center gap-3 text-muted-foreground">
                  <div className="flex items-center justify-center w-8 h-4">
                    <ThreeDot color={["#32cd32", "#327fcd", "#cd32cd", "#cd8032"]} size="small" style={{ fontSize: "5px" }} />
                  </div>
                  <span className="text-[14px] font-medium text-foreground/70 flex items-center gap-1">
                    <ShinyText 
                      text={`Thinking${loadingDots}`} 
                      speed={2} 
                      color="hsl(var(--muted-foreground) / 0.85)" 
                      shineColor="hsl(var(--foreground))" 
                    />
                  </span>
                </div>
              ) : hasPendingModifications ? (
                /* Review Mode */
                <div className="p-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 px-2 text-primary">
                      <span className="text-[13px] font-medium leading-none select-none">✦</span>
                      <span className="text-[13px] font-medium text-foreground whitespace-nowrap">
                        {changeCount === 1 ? "1 change" : `${changeCount} changes`}
                      </span>
                    </div>
                    <button
                      onClick={acceptAll}
                      className="flex items-center justify-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400 py-2 px-4 bg-green-500/10 hover:bg-green-500/20 rounded-xl transition-colors"
                    >
                      <CheckIcon className="w-4 h-4" />
                      Accept
                    </button>
                    <button
                      onClick={rejectAll}
                      className="flex items-center justify-center gap-1.5 text-xs font-medium text-red-500 dark:text-red-400 py-2 px-4 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-colors"
                    >
                      <XIcon className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                </div>
              ) : (
                /* Normal Input Mode */
                <form
                  onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
                  className="relative w-full flex items-end bg-transparent p-0.5"
                >
                  <textarea
                    ref={inputRef as any}
                    value={localInput}
                    onChange={(e) => {
                      setLocalInput(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                    }}
                    placeholder="Make it professional..."
                    className="w-full bg-transparent pl-4 pr-12 py-2 text-[14px] text-foreground outline-none resize-none overflow-y-auto custom-scrollbar"
                    rows={1}
                    style={{ minHeight: "36px", maxHeight: "120px", lineHeight: "20px" }}
                    disabled={isProcessing}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Escape") setIsExpanded(false);
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    onKeyUp={(e) => e.stopPropagation()}
                  />
                  <button
                    type="submit"
                    disabled={!localInput.trim() || isProcessing}
                    className="absolute right-2 bottom-1.5 shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-sm disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-all duration-200"
                  >
                    <ArrowUpIcon className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          </div>
        </BorderGlow>
      ) : (
        <div
          className="relative pointer-events-auto w-[76px] h-[18px] rounded-full cursor-pointer flex items-center justify-center hover:brightness-110 transition-all duration-300 ease-out"
          style={{
            backgroundColor: "hsl(var(--sidebar-bg))",
            boxShadow: "0 8px 32px -8px rgba(0,0,0,0.25)",
          }}
          onClick={() => setIsExpanded(true)}
          onMouseEnter={() => setIsExpanded(true)}
        >
          <span style={{ fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: "1px", opacity: 0.4 }}>✦</span>
        </div>
      )}
    </div>
  );
}

