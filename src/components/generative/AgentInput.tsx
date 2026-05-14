import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { motion, AnimatePresence } from "framer-motion";
import { SparklesIcon } from "@/components/icons/sparkles";
import { ArrowUpIcon } from "@/components/icons/arrow-up";
import { getAuthToken } from "@/lib/auth-client";
import { AI_API_BASE } from "@/lib/constants";
import { useEditor } from "novel";
import { CheckIcon, XIcon, CheckCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { markdownToProsemirror } from "@/lib/markdown-to-prosemirror";
import { Mapping } from "prosemirror-transform";

// --- Helpers ---

/**
 * Flat list of content blocks — includes empty blocks so AI can target them.
 */
function getContentBlocks(editor: ReturnType<typeof useEditor>["editor"]) {
  if (!editor || !editor.state) return [];
  const blocks: { index: number; text: string; from: number; to: number; nodeSize: number; contentSize: number }[] = [];
  let idx = 0;

  editor.state.doc.descendants((node, pos) => {
    // Leaf blocks: paragraphs, headings, list-item inner paragraphs, etc.
    if (node.isBlock && (node.isTextblock || (node.content.size === 0 && node.type.name === "paragraph"))) {
      blocks.push({
        index: idx,
        text: node.textContent,
        from: pos,
        to: pos + node.nodeSize,
        nodeSize: node.nodeSize,
        contentSize: node.content.size,
      });
      idx++;
    }
  });

  return blocks;
}

function buildDocumentContext(editor: ReturnType<typeof useEditor>["editor"]): string {
  const blocks = getContentBlocks(editor);
  if (blocks.length === 0) return "Document is empty.";
  return blocks.map((b) => `[Block ${b.index}]\n${b.text || "[empty]"}`).join("\n\n");
}

/**
 * Find a block by its text content in the current document state.
 * Returns fresh position data.
 */
function findBlockByText(editor: ReturnType<typeof useEditor>["editor"], oldText: string): { from: number; to: number; contentSize: number } | null {
  if (!editor || !editor.state) return null;
  let found: { from: number; to: number; contentSize: number } | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found) return false; // stop after first match
    if (node.isTextblock && node.textContent === oldText) {
      found = { from: pos, to: pos + node.nodeSize, contentSize: node.content.size };
    }
  });

  return found;
}

function parseMarkdown(md: string) {
  try {
    const jsonStr = markdownToProsemirror(md.trim());
    const json = JSON.parse(jsonStr);
    return json.content || md.trim();
  } catch {
    return md.trim();
  }
}

function applyHighlight(editor: ReturnType<typeof useEditor>["editor"], from: number, to: number) {
  if (!editor || !editor.schema.marks.highlight) return;
  try {
    editor.chain().command(({ tr }) => {
      const docSize = tr.doc.content.size;
      const safeFrom = Math.max(0, Math.min(from, docSize));
      const safeTo = Math.max(0, Math.min(to, docSize));

      tr.doc.nodesBetween(safeFrom, safeTo, (node, pos) => {
        if (node.isTextblock && pos >= safeFrom) {
          const tFrom = pos + 1;
          const tTo = pos + 1 + node.content.size;
          if (tTo > tFrom && tTo <= docSize) {
            tr.addMark(tFrom, tTo, editor.schema.marks.highlight.create({ color: "var(--agent-highlight)" }));
          }
        }
      });
      return true;
    }).run();
  } catch (err) {
    console.error("Highlight error:", err);
  }
}

// --- Component ---
export function AgentInput() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localInput, setLocalInput] = useState("");
  const [agentMessage, setAgentMessage] = useState<string | null>(null);
  const [isHidden, setIsHidden] = useState(() => localStorage.getItem("blacknote_hide_agent") === "true");

  useEffect(() => {
    const handleVisibility = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setIsHidden(!detail); // detail is the new "visible" state
    };
    window.addEventListener("blacknote_agent_visibility", handleVisibility);
    return () => window.removeEventListener("blacknote_agent_visibility", handleVisibility);
  }, []);

  // Simplified state
  const [hasPendingModifications, setHasPendingModifications] = useState(false);
  const [loadingDots, setLoadingDots] = useState("");
  const snapshotRef = useRef<any>(null); // Initial JSON snapshot
  const initialBlocksRef = useRef<any[]>([]); // Store original block indexes
  const mappingRef = useRef<Mapping>(new Mapping()); // Track position shifts
  const busyRef = useRef(false); // Track if AI is actively working or has pending changes

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

  const inputRef = useRef<HTMLInputElement>(null);
  const { editor } = useEditor();
  const editorRef = useRef(editor);
  editorRef.current = editor; // Always keep fresh reference
  const hasOpenedRef = useRef(false);

  // Auto-expand if the note is empty
  useEffect(() => {
    if (!editor) return;
    
    const checkEmpty = () => {
      if (editor.isEmpty) {
        setIsExpanded(true);
      }
    };

    // Check initially
    checkEmpty();

    // Check on updates (like when a new empty note is loaded)
    editor.on('update', checkEmpty);
    return () => {
      editor.off('update', checkEmpty);
    };
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
    return () => {
      editor.off("focus", handleFocus);
    };
  }, [editor, isExpanded, localInput]);

  // Track document position shifts while in review mode
  useEffect(() => {
    if (!editor) return;
    const handleTransaction = ({ transaction }: any) => {
      if (snapshotRef.current && mappingRef.current) {
        mappingRef.current.appendMapping(transaction.mapping);
      }
    };
    editor.on("transaction", handleTransaction);
    return () => {
      editor.off("transaction", handleTransaction);
    };
  }, [editor]);

  useEffect(() => {
    getAuthToken();
  }, []);

  const { messages, sendMessage, status, error, setMessages } = useChat({
    onError: (err) => {
      if (
        err.message.includes("402") ||
        err.message.includes("401") ||
        err.message.includes("Insufficient") ||
        err.message.includes("429") ||
        err.message.includes("RESOURCE_EXHAUSTED")
      ) {
        window.dispatchEvent(new CustomEvent("ai-error"));
      }
    },
    transport: new DefaultChatTransport({
      api: "/api/ai/agent",
      fetch: async (_url, options) => {
        const currentToken = await getAuthToken();
        const endpoint = `${AI_API_BASE}/api/ai/agent`;
        const headers = {
          ...options?.headers,
          ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
        };
        const parsedBody = JSON.parse(options?.body as string);
        parsedBody.documentContext = buildDocumentContext(editorRef.current);
        if (parsedBody.messages?.length > 0) {
          parsedBody.messages = [parsedBody.messages[parsedBody.messages.length - 1]];
        }
        return fetch(endpoint, { ...options, headers, body: JSON.stringify(parsedBody) });
      },
    }),
    onToolCall: (({ toolCall }: any) => {
      const args = (toolCall as any).args || (toolCall as any).input;
      const ed = editorRef.current;
      console.log("Agent called tool:", toolCall.toolName, args);
      if (!ed || !ed.state) return "ok";

      // Immediately mark as busy to prevent scroll/focus from collapsing
      busyRef.current = true;

      try {
        if (toolCall.toolName === "applyFormatting") {
          const { color, bold, italic, align } = args as any;
          let chain = ed.chain().selectAll();
          if (color) {
            chain = color === "default" ? chain.unsetColor() : chain.setColor(color);
          }
          if (bold) chain = chain.setBold();
          if (italic) chain = chain.setItalic();
          if (align) chain = (chain as any).setTextAlign(align);
          chain.run();
          setHasPendingModifications(true);
          return "Formatting applied";
        }

        if (toolCall.toolName === "replaceBlock") {
          const { blockIndex, newContent } = args as { blockIndex: number; newContent: string };
          const target = initialBlocksRef.current.find((b) => b.index === blockIndex);

          if (target) {
            // Absolute position mapping (100% accurate even if empty or duplicate)
            const currentFrom = mappingRef.current.map(target.from);
            const currentTo = mappingRef.current.map(target.to);

            // Smart delete: if it's the only paragraph in a list item, select the list item
            let deleteFrom = currentFrom;
            let deleteTo = currentTo;
            try {
              const $from = ed.state.doc.resolve(currentFrom);
              if ($from.parent.type.name === "paragraph" && $from.depth > 1) {
                const grandParent = $from.node(-1);
                if (grandParent.type.name === "listItem" && grandParent.childCount === 1) {
                  deleteFrom = $from.before(-1);
                  deleteTo = $from.after(-1);
                }
              }
            } catch (e) {} // Ignore if document structure changed too much

            if (newContent.trim()) {
              const parsed = parseMarkdown(newContent);

              // Use single dispatch: delete + insert in one transaction
              const { tr } = ed.state;
              tr.delete(deleteFrom, deleteTo);
              ed.view.dispatch(tr);

              // Insert at same position after deletion
              ed.commands.insertContentAt(deleteFrom, parsed);

              // Highlight
              try {
                const endPos = Math.min(deleteFrom + 500, ed.state.doc.content.size);
                applyHighlight(ed, deleteFrom, endPos);
              } catch {}
            } else {
              const { tr } = ed.state;
              tr.delete(deleteFrom, deleteTo);
              ed.view.dispatch(tr);
            }
            setHasPendingModifications(true);
            return `Block ${blockIndex} replaced/deleted`;
          }
          return `Block ${blockIndex} not found`;
        }

        if (toolCall.toolName === "insertBlocks") {
          const { content } = args as { content: string };
          const parsed = parseMarkdown(content);
          const pos = ed.state.doc.content.size;

          const sizeBefore = ed.state.doc.content.size;
          ed.commands.insertContentAt(pos, parsed);
          const sizeAfter = ed.state.doc.content.size;
          const insertedLength = sizeAfter - sizeBefore;

          if (insertedLength > 0) {
            applyHighlight(ed, pos, pos + insertedLength);
          }

          setHasPendingModifications(true);
          return "Content inserted";
        }

        return "ok";
      } catch (err) {
        console.error("Error executing tool call:", err);
        return `Error: ${err}`;
      }
    }) as any,
  });

  const isLoading = status === "submitted" || status === "streaming";

  // Keep busyRef in sync for event handlers declared before useChat
  useEffect(() => {
    busyRef.current = isLoading || hasPendingModifications;
  }, [isLoading, hasPendingModifications]);

  // Animate loading dots
  useEffect(() => {
    if (!isLoading) {
      setLoadingDots("");
      return;
    }
    const interval = setInterval(() => {
      setLoadingDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 400);
    return () => clearInterval(interval);
  }, [isLoading]);

  // --- Accept all changes ---
  const acceptAll = useCallback(() => {
    if (!editor || !editor.state) return;

    // Remove all highlight marks from the document
    editor.chain().focus().command(({ tr }) => {
      if (editor.schema.marks.highlight) {
        tr.removeMark(0, tr.doc.content.size, editor.schema.marks.highlight);
      }
      return true;
    }).run();

    setHasPendingModifications(false);
    snapshotRef.current = null;
    setAgentMessage(null);
  }, [editor]);

  // --- Reject all changes ---
  const rejectAll = useCallback(() => {
    if (!editor || !editor.state || !snapshotRef.current) return;

    // Restore the snapshot
    editor.commands.setContent(snapshotRef.current);

    setHasPendingModifications(false);
    snapshotRef.current = null;
    setAgentMessage(null);
  }, [editor]);

  // --- Extract last AI text message ---
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "assistant" && typeof (lastMsg as any).content === "string" && (lastMsg as any).content.trim()) {
        setAgentMessage((lastMsg as any).content.trim());
      }
    }
  }, [messages]);

  // --- Focus management ---
  useEffect(() => {
    if (isExpanded && !hasOpenedRef.current) {
      setMessages([]);
      setAgentMessage(null);
      setHasPendingModifications(false);
      snapshotRef.current = null;
      hasOpenedRef.current = true;
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    if (!isExpanded) {
      hasOpenedRef.current = false;
    }
  }, [isExpanded]);

  if (!editor || isHidden) return null;

  return (
    <div
      className="fixed left-0 right-0 z-50 flex justify-center pointer-events-none px-4 transition-all duration-300"
      style={{ bottom: "5px" }}
    >
      <div
        className={`pointer-events-auto flex flex-col overflow-hidden transition-all duration-300 ease-out backdrop-blur-xl ${isExpanded ? "w-full max-w-[600px] rounded-[32px]" : "w-[76px] h-[18px] rounded-full cursor-pointer items-center justify-center hover:brightness-110"
          }`}
        style={{
          background: "linear-gradient(135deg, rgba(120, 120, 128, var(--icon-bg-start)) 0%, rgba(120, 120, 128, var(--icon-bg-end)) 100%), var(--agent-pill-bg)",
          border: "1px solid rgba(120, 120, 128, var(--icon-border))",
          boxShadow: "0 20px 40px -10px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
        }}
        onClick={() => {
          if (!isExpanded) setIsExpanded(true);
        }}
        onMouseEnter={() => {
          if (!isExpanded) setIsExpanded(true);
        }}
      >
        {!isExpanded ? (
          <span style={{ fontSize: 13, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: "1px" }}>✦</span>
        ) : (
          <div className="flex flex-col w-full h-full animate-in fade-in duration-300">
            {/* Error State */}
            {error && (
              <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex items-center justify-between rounded-t-[32px]">
                <span className="text-xs text-red-500 font-medium">Error: {error.message}</span>
              </div>
            )}

            {isLoading ? (
              /* Loading State */
              <div className="px-5 py-2.5 flex items-center gap-2.5 text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-zinc-500 dark:bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-1.5 h-1.5 bg-zinc-500 dark:bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-1.5 h-1.5 bg-zinc-500 dark:bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-[14px] font-medium w-20">Working{loadingDots}</span>
              </div>
            ) : hasPendingModifications ? (
              /* Global Review Mode */
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
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!localInput.trim() || isLoading) return;
                  const token = await getAuthToken();
                  if (!token) {
                    window.dispatchEvent(new CustomEvent("ai-error"));
                    return;
                  }
                  setAgentMessage(null);
                  if (!snapshotRef.current) {
                    if (!editor || !editor.state) return;
                    snapshotRef.current = editor.getJSON();
                    initialBlocksRef.current = getContentBlocks(editor);
                    mappingRef.current = new Mapping();
                  }
                  sendMessage({ role: "user", content: localInput } as any);
                  setLocalInput("");
                }}
                className="p-1 flex items-end relative"
              >
                <textarea
                  ref={inputRef as any}
                  value={localInput}
                  onChange={(e) => {
                    setLocalInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                  }}
                  placeholder="Make it professional..."
                  className="flex-1 bg-transparent px-5 py-2 text-[15px] text-foreground outline-none resize-none overflow-y-auto"
                  rows={1}
                  style={{ minHeight: "36px", maxHeight: "120px" }}
                  disabled={isLoading}
                  onKeyDown={async (e) => {
                    e.stopPropagation();
                    if (e.key === "Escape") setIsExpanded(false);
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (localInput.trim() && !isLoading) {
                        const token = await getAuthToken();
                        if (!token) {
                          window.dispatchEvent(new CustomEvent("ai-error"));
                          return;
                        }
                        setAgentMessage(null);
                        if (!snapshotRef.current) {
                          if (!editor || !editor.state) return;
                          snapshotRef.current = editor.getJSON();
                          initialBlocksRef.current = getContentBlocks(editor);
                          mappingRef.current = new Mapping();
                        }
                        sendMessage({ role: "user", content: localInput } as any);
                        setLocalInput("");
                      }
                    }
                  }}
                  onKeyUp={(e) => e.stopPropagation()}
                />
                <button
                  type="submit"
                  disabled={!localInput.trim() || isLoading}
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
  );
}
