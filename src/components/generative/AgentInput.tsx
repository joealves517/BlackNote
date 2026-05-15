import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SparklesIcon } from "@/components/icons/sparkles";
import { ArrowUpIcon } from "@/components/icons/arrow-up";
import { getAuthToken } from "@/lib/auth-client";
import { AI_API_BASE } from "@/lib/constants";
import { useEditor } from "novel";
import { CheckIcon, XIcon } from "lucide-react";
import { markdownToProsemirror } from "@/lib/markdown-to-prosemirror";
import { DOMSerializer } from "prosemirror-model";
import TurndownService from "turndown";
import { agentDecorationKey } from "@/extensions/AgentDecoration";

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
      let md = "";

      try {
        const dom = serializer.serializeNode(node);
        const wrapper = document.createElement("div");
        wrapper.appendChild(dom);
        md = turndown.turndown(wrapper.innerHTML).trim();
      } catch {
        // Fallback for custom nodes (AudioNode, VideoNode, etc.)
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
    const match = line.match(/^«(b\d+|new)»\s*(.*)/);
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
 * Apply AI changes using a safe setContent approach.
 * Builds the complete new document JSON by swapping changed blocks,
 * then applies it as a single atomic operation — avoids ProseMirror state corruption.
 */
function applyChanges(
  editor: ReturnType<typeof useEditor>["editor"],
  blockMap: Map<string, BlockPosition>,
  changes: AgentChange[]
) {
  if (!editor) return;

  const changeMap = new Map(changes.map((c) => [c.blockId, c]));
  const docJson = editor.getJSON();

  if (!docJson.content) return;

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
  const decorationRanges: {from: number, to: number}[] = [];
  
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
      } catch {}
    });
  }
}

// --- Component ---
export function AgentInput() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localInput, setLocalInput] = useState("");
  const [agentMessage, setAgentMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasPendingModifications, setHasPendingModifications] = useState(false);
  const [loadingDots, setLoadingDots] = useState("");
  const [isHidden, setIsHidden] = useState(() => localStorage.getItem("blacknote_hide_agent") === "true");

  const snapshotRef = useRef<any>(null);
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

  useEffect(() => {
    const handleScroll = () => {
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

    // Snapshot for reject
    snapshotRef.current = ed.getJSON();

    // Serialize document with block IDs
    const { markdown, blockMap } = serializeWithBlockIds(ed);
    blockMapRef.current = blockMap;

    const instruction = localInput;
    setLocalInput("");
    setIsProcessing(true);
    setAgentMessage(null);

    try {
      const response = await fetch(`${AI_API_BASE}/api/ai/agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ markdown, instruction }),
      });

      if (!response.ok) {
        if ([401, 402, 429].includes(response.status)) {
          window.dispatchEvent(new CustomEvent("ai-error"));
        }
        throw new Error(`HTTP ${response.status}`);
      }

      // Read the full streamed response
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
      }

      // Parse block changes from AI response
      const changes = parseAgentResponse(fullText);

      if (changes.length > 0) {
        applyChanges(ed, blockMap, changes);
        setHasPendingModifications(true);
      } else {
        // No block markers → AI answered a general question
        // Strip out any <think> tags and their contents
        const cleanText = fullText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        setAgentMessage(cleanText || null);
        snapshotRef.current = null;
      }
    } catch (err) {
      console.error("[Agent] Error:", err);
      setAgentMessage("⚠️ Failed to process. Please try again.");
      snapshotRef.current = null;
    } finally {
      setIsProcessing(false);
    }
  }, [localInput, isProcessing]);

  // --- Accept / Reject ---

  const acceptAll = useCallback(() => {
    if (!editor || !editor.state) return;
    editor.view.dispatch(editor.state.tr.setMeta(agentDecorationKey, { clear: true }));
    setHasPendingModifications(false);
    snapshotRef.current = null;
    setAgentMessage(null);
  }, [editor]);

  const rejectAll = useCallback(() => {
    if (!editor || !editor.state || !snapshotRef.current) return;
    editor.commands.setContent(snapshotRef.current);
    editor.view.dispatch(editor.state.tr.setMeta(agentDecorationKey, { clear: true }));
    setHasPendingModifications(false);
    snapshotRef.current = null;
    setAgentMessage(null);
  }, [editor]);

  // Cleanup fake highlight on unmount
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
      className="absolute inset-x-0 z-50 flex flex-col items-center justify-end pointer-events-none px-4 transition-all duration-300 gap-1.5"
      style={{ bottom: "5px" }}
    >
      {/* Agent text message (for general Q&A responses) floats ABOVE the prompt */}
      <AnimatePresence>
        {agentMessage && !isProcessing && !hasPendingModifications && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            className="pointer-events-auto w-full max-w-[600px] p-5 rounded-[28px]"
            style={{
              background: "linear-gradient(135deg, rgba(120, 120, 128, var(--icon-bg-start)) 0%, rgba(120, 120, 128, var(--icon-bg-end)) 100%), hsl(var(--background) / 0.82)",
              backdropFilter: "blur(40px) saturate(200%)",
              WebkitBackdropFilter: "blur(40px) saturate(200%)",
              boxShadow: "0 12px 40px -12px rgba(0,0,0,0.3)",
              border: "0.5px solid rgba(120, 120, 128, 0.2)",
            }}
          >
            <div className="text-[14px] text-foreground leading-relaxed max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {agentMessage}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div
        className={`relative pointer-events-auto flex flex-col overflow-hidden transition-all duration-300 ease-out ${isExpanded ? "w-full max-w-[600px] rounded-[32px]" : "w-[76px] h-[18px] rounded-full cursor-pointer items-center justify-center hover:brightness-110"
          }`}
        style={{
          background: "linear-gradient(135deg, rgba(120, 120, 128, var(--icon-bg-start)) 0%, rgba(120, 120, 128, var(--icon-bg-end)) 100%), hsl(var(--background) / 0.82)",
          backdropFilter: "blur(40px) saturate(200%)",
          WebkitBackdropFilter: "blur(40px) saturate(200%)",
          boxShadow: "0 8px 32px -8px rgba(0,0,0,0.25)",
          border: isExpanded ? "0.5px solid hsl(var(--border))" : "none",
        }}
        onClick={() => { if (!isExpanded) setIsExpanded(true); }}
        onMouseEnter={() => { if (!isExpanded) setIsExpanded(true); }}
      >
        <div className="relative z-10 flex flex-col items-center justify-center w-full h-full">
          {!isExpanded ? (
            <span style={{ fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: "1px" }}>✦</span>
          ) : (
            <div className="flex flex-col w-full h-full animate-in fade-in duration-300">
            {/* Loading State */}
            {isProcessing ? (
              <div className="px-5 py-3 flex items-center gap-3 text-muted-foreground">
                <div className="flex items-center gap-1.5 px-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-1.5 h-1.5 bg-primary/70 rounded-full"
                      animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                      transition={{
                        duration: 1.2,
                        repeat: Infinity,
                        delay: i * 0.2,
                        ease: "easeInOut",
                      }}
                    />
                  ))}
                </div>
                <span className="text-[14px] font-medium w-20 text-foreground/70">Thinking{loadingDots}</span>
              </div>
            ) : hasPendingModifications ? (
              /* Review Mode */
              <div className="p-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 px-2 text-primary">
                    <SparklesIcon className="w-4 h-4" />
                    <span className="text-[13px] font-medium text-foreground whitespace-nowrap">Review</span>
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
                className="p-1 flex items-end relative"
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
                  className="flex-1 bg-transparent px-5 py-2 text-[15px] text-foreground outline-none resize-none overflow-y-auto"
                  rows={1}
                  style={{ minHeight: "36px", maxHeight: "120px" }}
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
                  className="mb-1 mr-1 shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ArrowUpIcon className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
