import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCompletion } from "@ai-sdk/react";
import { useEditor } from "novel";
import { AttachFileIcon } from "@/components/icons/attach-file";
import { markdownToProsemirror } from "@/lib/markdown-to-prosemirror";
import { AI_API_BASE } from "@/lib/constants";
import { getAuthToken } from "@/lib/auth-client";
import { ClipboardCheckIcon } from "@/components/icons/clipboard-check";
import { CheckIcon } from "@/components/icons/check";
import { SparklesIcon } from "@/components/icons/sparkles";
import { MessageSquareMoreIcon } from "@/components/icons/message-square-more";
import { MessageSquareIcon } from "@/components/icons/message-square";
import { RefreshCCWDotIcon } from "@/components/icons/refresh-ccw-dot";
import { AlignLeftIcon } from "@/components/icons/align-left";
import { BookTextIcon } from "@/components/icons/book-text";
import { CheckCheckIcon } from "@/components/icons/check-check";
import { BrainIcon } from "@/components/icons/brain";
import { GripIcon } from "@/components/icons/grip";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import { ScanTextIcon } from "@/components/icons/scan-text";
import { DynamicThinking } from "@/components/ui/dynamic-thinking";
import { useAuth } from "@/hooks/use-auth";
import { useCredits } from "@/hooks/use-credits";
import { getTranscriptsForNote } from "@/lib/media-ai-service";

interface ChatMessage {
  role: "user" | "ai";
  content: string;
}

interface NoteChatSheetProps {
  noteId: string;
  noteTitle: string;
  noteContent: string;
  initialHistory: ChatMessage[];
  onHistoryChange: (newHistory: ChatMessage[]) => void;
  onClose: () => void;
}

// Helper to extract text from markdown nodes
function extractMarkdownText(node: any): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractMarkdownText).join("");
  if (node && node.props && node.props.children) return extractMarkdownText(node.props.children);
  return "";
}

// Helper to extract text from ProseMirror JSON
function extractProseMirrorText(node: any): string {
  if (node.type === "text") return node.text || "";
  if (node.content) return node.content.map(extractProseMirrorText).join(" ");
  return "";
}

/* ===== NoteChatSheet ===== */

export function NoteChatSheet({
  noteId,
  noteTitle,
  noteContent,
  initialHistory,
  onHistoryChange,
  onClose,
}: NoteChatSheetProps) {
  const { user } = useAuth();
  const { credits } = useCredits(user?.id);
  const isPremium = credits?.tier === "premium";
  const userName = user?.displayName?.split(" ")[0] || "there";
  const [messages, setMessages] = useState<ChatMessage[]>(initialHistory || []);
  const [input, setInput] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { editor } = useEditor();
  const lastSentContextRef = useRef<string>("");

  // Load media transcripts for enriching AI context
  const [mediaContext, setMediaContext] = useState("");
  const [mediaTranscripts, setMediaTranscripts] = useState<Map<string, any>>(new Map());
  useEffect(() => {
    if (!editor) return;
    const docStr = JSON.stringify(editor.getJSON());
    getTranscriptsForNote(noteId, docStr).then((transcripts) => {
      setMediaTranscripts(transcripts);
      if (transcripts.size === 0) {
        // Check if there are unanalyzed media nodes
        const hasMedia = docStr.includes('"audioNode"') || docStr.includes('"videoNode"');
        if (hasMedia) {
          setMediaContext(
            `\n\n--- MEDIA: Audio/Video recording(s) present in this note but NOT yet analyzed ---\nIf the user asks about any recording, respond: "This recording hasn't been analyzed yet. Please tap on the recording and select 'Analyze with AI' to transcribe it first."\n---`
          );
        }
        return;
      }
      let ctx = "";
      transcripts.forEach((t, mediaId) => {
        ctx += `\n\n--- MEDIA TRANSCRIPT (ID: ${mediaId}) ---\n${t.transcript}\n--- END TRANSCRIPT ---`;
      });
      setMediaContext(ctx);
    });
  }, [editor, noteId]);

  useEffect(() => {
    getAuthToken().then(setToken);
  }, []);

  const { completion, complete, isLoading } = useCompletion({
    api: "/api/ai", // Overridden by custom fetch below
    fetch: async (url, options) => {
      const currentToken = await getAuthToken();
      const endpoint = currentToken ? `${AI_API_BASE}/api/ai` : `${AI_API_BASE}/api/ai/free`;
      const headers = {
        ...options?.headers,
        ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {})
      };
      const response = await fetch(endpoint, { ...options, headers });

      // Surface HTTP errors so useCompletion triggers onError
      if (!response.ok) {
        console.error("[NoteChatSheet] HTTP error:", response.status, response.statusText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response;
    },
    streamProtocol: "text",
    onFinish: (_prompt, comp) => {
      console.log("[NoteChatSheet] onFinish:", comp?.substring(0, 100));
      if (!comp || !comp.trim()) {
        setMessages((prev) => {
          const updated = [...prev, { role: "ai", content: "Sorry, I couldn't generate a response. Please try again." }];
          onHistoryChange(updated);
          return updated;
        });
        return;
      }
      const newMsg: ChatMessage = { role: "ai", content: comp };
      setMessages((prev) => {
        const updated = [...prev, newMsg];
        onHistoryChange(updated);
        return updated;
      });
    },
    onError: (err) => {
      console.error("[NoteChatSheet] onError called:", err);
      const errorMsg = isPremium
        ? "An error occurred, please try again."
        : "We are facing high traffic, consider upgrading to PRO to enjoy the best experience.";

      setMessages((prev) => {
        const updated = [...prev, { role: "ai", content: errorMsg }];
        onHistoryChange(updated);
        return updated;
      });
    },
  });

  // Auto-scroll to bottom on new messages or during AI streaming completion
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, completion]);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    const currentInput = input.trim();
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const userMsg: ChatMessage = { role: "user", content: currentInput };
    setMessages((prev) => [...prev, userMsg]);

    if (!user) {
      setTimeout(() => {
        setMessages((prev) => {
          const updated = [...prev, { role: "ai", content: "You need to log in to use the AI assistant." }];
          onHistoryChange(updated);
          return updated;
        });
      }, 500);
      return;
    }

    const allHistory = [...messages, userMsg];
    // Keep only last 10 messages to avoid exceeding token limits
    const trimmedHistory = allHistory.slice(-10);

    // Only send full noteContext on first message or when content changes
    const currentContextFingerprint = `${noteTitle}|${noteContent}|${mediaContext}`;
    const isFirstOrChanged = lastSentContextRef.current !== currentContextFingerprint;

    const fullContext = `--- STRICT SYSTEM RULES ---\n1. Always reply in the exact same language as the user's prompt.\n2. When referencing TEXT from the note, you MUST quote the exact source text using markdown blockquotes (e.g. > quote text). NEVER provide an answer without citing the exact blockquote if your answer relies on TEXT from the note.\n3. When quoting multiple lines or lists of TEXT, you MUST preserve the exact line breaks and list numbers from the original text.\n4. IMPORTANT: The note may contain appended MEDIA TRANSCRIPT sections at the end. You MUST read and use them to answer questions about the recordings. Ignore any dummy text like 'Video Transcript Unavailable' if a MEDIA TRANSCRIPT is actually provided below it.\n5. STRICT RULE FOR MEDIA: If your answer relies on a MEDIA TRANSCRIPT, NEVER quote or regurgitate the raw transcript text. Just summarize the information naturally in your own words to answer the user's question. DO NOT use blockquotes or media citations for information coming from the transcript.\n\n# NOTE TITLE: ${noteTitle}\n\n# NOTE CONTENT:\n${noteContent}${mediaContext}`;

    const lightContext = `--- SYSTEM RULES ---\nContinue the conversation. The note context was already provided. Refer to conversation history for note content.\nAlways reply in the same language as the user. If referencing the note, use blockquotes. For MEDIA TRANSCRIPT info, summarize naturally without quoting raw text.\n\n# NOTE TITLE: ${noteTitle}`;

    const contextToSend = isFirstOrChanged ? fullContext : lightContext;
    lastSentContextRef.current = currentContextFingerprint;

    try {
      await complete(currentInput, {
        body: {
          option: "chat",
          history: trimmedHistory,
          noteContext: contextToSend,
        },
      });
    } catch (err) {
      console.error("[NoteChatSheet] complete() failed:", err);
      const errorMsg = isPremium
        ? "An error occurred, please try again."
        : "We are facing high traffic, consider upgrading to PRO.";
      setMessages((prev) => {
        const updated = [...prev, { role: "ai", content: errorMsg }];
        onHistoryChange(updated);
        return updated;
      });
    }
  }, [input, isLoading, messages, noteTitle, noteContent, mediaContext, complete, user, isPremium]);

  const handleCopy = useCallback((text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  }, []);

  const handleInsertBelow = useCallback(
    (text: string) => {
      if (!editor) return;
      try {
        const docSize = editor.state.doc.content.size;
        const jsonStr = markdownToProsemirror(text);
        const json = JSON.parse(jsonStr);
        const parsed = json.content || text;
        editor.chain().focus().insertContentAt(docSize, parsed).run();
      } catch {
        // Fallback: insert as plain text paragraph
        const docSize = editor.state.doc.content.size;
        editor.chain().focus().insertContentAt(docSize, text).run();
      }
    },
    [editor]
  );

  const handleReplaceNote = useCallback(
    (text: string) => {
      if (!editor) return;
      try {
        const jsonStr = markdownToProsemirror(text);
        const json = JSON.parse(jsonStr);
        const parsed = json.content || text;
        editor.chain().focus().clearContent().insertContent(parsed).run();
      } catch {
        editor.chain().focus().clearContent().insertContent(text).run();
      }
    },
    [editor]
  );

  const handleLocateQuote = useCallback((quoteText: string) => {
    console.log("[Scan] handleLocateQuote called with:", quoteText);
    if (!editor) {
      console.warn("[Scan] editor is undefined or null!");
      return;
    }
    
    // Clean up quote text
    const searchText = quoteText.trim();
    if (!searchText) return;

    // We will extract only alphanumeric characters from the editor to ignore formatting differences (like \n, "1.", etc.)
    const strippedToPos: number[] = [];
    const strippedChars: string[] = [];
    
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        for (let i = 0; i < node.text.length; i++) {
          const char = node.text[i];
          if (/[a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF]/.test(char)) { // Support Vietnamese and accents
            strippedChars.push(char.toLowerCase());
            strippedToPos.push(pos + i);
          }
        }
      }
    });

    const editorStripped = strippedChars.join('');
    const quoteStripped = searchText.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f\u1e00-\u1eff]/gi, '');

    if (!quoteStripped) return;

    let matchIndex = editorStripped.indexOf(quoteStripped);
    let matchLength = quoteStripped.length;

    // Fuzzy matching fallback on stripped text (if AI modified the text slightly)
    if (matchIndex === -1 && quoteStripped.length > 10) {
      // Try to match progressively shorter chunks from the beginning
      for (let i = quoteStripped.length; i >= 10; i -= 5) {
        const partial = quoteStripped.slice(0, i);
        const pIdx = editorStripped.indexOf(partial);
        if (pIdx !== -1) {
          matchIndex = pIdx;
          matchLength = partial.length;
          break;
        }
      }
    }

    if (matchIndex !== -1) {
      const startPos = strippedToPos[matchIndex];
      // The end position should be just after the last matched character
      const endPos = strippedToPos[matchIndex + matchLength - 1] + 1;
      
      onClose(); // close the bottom sheet

      setTimeout(() => {
        editor.chain().focus().setTextSelection({ from: startPos, to: endPos }).run();
        
        // Safely scroll to the selected text without mutating Prosemirror's DOM
        try {
          const domInfo = editor.view.domAtPos(startPos);
          if (domInfo && domInfo.node) {
            let node = domInfo.node;
            if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
              node = node.parentElement;
            }
            if (node instanceof Element) {
              node.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
        } catch (e) {
          console.error("Failed to scroll to pos:", e);
        }
      }, 300); // slight delay to let sheet close animation finish
    } else {
      console.warn("[Scan] Could not find any fuzzy match for the quote.");
      onClose(); // close even if we couldn't find it
    }
  }, [editor, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const setValue = (v: string) => setInput(v);

  const isEmpty = messages.length === 0 && !completion;
  const hasValue = input.trim().length > 0;

  // Extract plain text from ProseMirror JSON for display
  let noteTextPreview = "";
  try {
    const parsed = JSON.parse(noteContent);
    noteTextPreview = extractProseMirrorText(parsed).slice(0, 120);
  } catch {
    noteTextPreview = noteContent?.slice(0, 120) || "";
  }

  const wordCount = noteTextPreview.split(/\s+/).filter(Boolean).length;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="history-sheet-backdrop"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />

      <motion.div
        className="history-sheet"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
        style={{ display: "flex", flexDirection: "column", maxWidth: 600, margin: "0 auto" }}
      >
        {/* Drag Handle */}
        <div className="history-sheet-handle" onClick={onClose}>
          <div className="history-sheet-handle-bar" />
        </div>

        {/* Messages Area */}
        <div
          ref={scrollContainerRef}
          style={{
            flex: 1,
            overflowY: "auto",
            position: "relative",
            paddingBottom: 160,
          }}
        >
          {isEmpty ? (
            <EmptyState
              noteTitle={noteTitle}
              wordCount={wordCount}
              noteTextPreview={noteTextPreview}
              noteContent={noteContent}
              userName={userName}
              onQuickAction={(prompt) => {
                const userMsg: ChatMessage = { role: "user", content: prompt };
                setMessages((prev) => [...prev, userMsg]);

                if (!user) {
                  setTimeout(() => {
                    setMessages((prev) => {
                      const updated = [...prev, { role: "ai", content: "You need to log in to use the AI assistant." }];
                      onHistoryChange(updated);
                      return updated;
                    });
                  }, 500);
                  return;
                }

                complete(prompt, {
                  body: {
                    option: "chat",
                    history: [userMsg],
                    noteContext: `# ${noteTitle}\n\n${noteContent}${mediaContext}\n\n--- System Instruction ---\nYou are a smart note assistant. When referencing TEXT from the note, you MUST quote the exact source text using markdown blockquotes (e.g. > quote text). IMPORTANT: The note may contain appended MEDIA TRANSCRIPT sections at the end. You MUST read and use them to answer questions about the recordings. Ignore any dummy text like 'Video Transcript Unavailable' if a MEDIA TRANSCRIPT is actually provided below it. STRICT RULE FOR MEDIA: If your answer relies on a MEDIA TRANSCRIPT, NEVER quote or regurgitate the raw transcript text. Just summarize the information naturally in your own words. DO NOT use blockquotes or media citations for information coming from the transcript.`,
                  },
                });
              }}
            />
          ) : (
            /* Chat Messages — Chat with Page style */
            <div style={{ padding: "0 4px" }}>
              {messages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                    gap: 4,
                    paddingRight: msg.role === "user" ? 14 : 0,
                    marginBottom: 16,
                  }}
                >
                  <div
                    className={msg.role === "user" ? undefined : "chat-message-ai"}
                    style={{
                      maxWidth: msg.role === "user" ? "85%" : "100%",
                      borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "0",
                      backgroundColor: msg.role === "user" ? "hsl(var(--secondary))" : "transparent",
                      color: "hsl(var(--foreground))",
                      padding: msg.role === "user" ? "10px 16px" : "0 12px",
                      fontSize: 14,
                      lineHeight: 1.6,
                    }}
                  >
                    {msg.role === "user" ? (
                      <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{msg.content}</p>
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ ...props }) => (
                            <p style={{ margin: "4px 0", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }} {...props} />
                          ),
                          ul: ({ ...props }) => <ul style={{ listStyleType: "disc", paddingLeft: "1.5em", margin: "4px 0" }} {...props} />,
                          ol: ({ ...props }) => <ol style={{ listStyleType: "decimal", paddingLeft: "1.5em", margin: "4px 0" }} {...props} />,
                          li: ({ ...props }) => <li style={{ marginBottom: "2px" }} {...props} />,
                          h1: ({ ...props }) => <h1 style={{ fontWeight: 600, fontSize: "1.2em", margin: "8px 0 4px 0" }} {...props} />,
                          h2: ({ ...props }) => <h2 style={{ fontWeight: 600, fontSize: "1.1em", margin: "8px 0 4px 0" }} {...props} />,
                          h3: ({ ...props }) => <h3 style={{ fontWeight: 600, fontSize: "1.05em", margin: "8px 0 4px 0" }} {...props} />,
                          a: ({ ...props }) => (
                            <a target="_blank" rel="noopener noreferrer" {...props} />
                          ),
                          blockquote: ({ children, ...props }) => {
                            const plainText = extractMarkdownText(children);
                            return (
                              <div
                                style={{
                                  margin: "6px 0",
                                }}
                              >
                                <blockquote
                                  {...props}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    console.log("[Scan] plainText:", JSON.stringify(plainText));
                                    handleLocateQuote(plainText);
                                  }}
                                  style={{
                                    margin: 0,
                                    borderLeft: "2px solid hsl(var(--muted-foreground) / 0.4)",
                                    paddingLeft: 10,
                                    fontSize: 13,
                                    color: "hsl(var(--muted-foreground))",
                                    lineHeight: 1.5,
                                    cursor: "pointer",
                                    transition: "opacity 0.2s",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.opacity = "0.7";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.opacity = "1";
                                  }}
                                >
                                  {children}
                                </blockquote>
                              </div>
                            );
                          },
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    )}
                  </div>

                  {/* Action buttons for AI messages */}
                  {msg.role === "ai" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 12 }}>
                      <ActionButtonWithTooltip
                        icon={copiedIdx === i ? <CheckIcon className="w-3.5 h-3.5" /> : <ClipboardCheckIcon className="w-3.5 h-3.5" />}
                        label="Copy"
                        onClick={() => handleCopy(msg.content, i)}
                        isActive={copiedIdx === i}
                      />
                      <ActionButtonWithTooltip
                        icon={<MessageSquareIcon className="w-3.5 h-3.5" />}
                        label="Insert Below"
                        onClick={() => handleInsertBelow(msg.content)}
                      />
                      <ActionButtonWithTooltip
                        icon={<RefreshCCWDotIcon className="w-3.5 h-3.5" />}
                        label="Replace Note"
                        onClick={() => handleReplaceNote(msg.content)}
                      />
                    </div>
                  )}
                </div>
              ))}

              {/* Streaming */}
              {isLoading && completion && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    marginBottom: 16,
                  }}
                >
                  <div className="chat-message-ai" style={{ padding: "0 12px", fontSize: 14, lineHeight: 1.6 }}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ ...props }) => (
                          <p style={{ margin: "4px 0", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }} {...props} />
                        ),
                        ul: ({ ...props }) => <ul style={{ listStyleType: "disc", paddingLeft: "1.5em", margin: "4px 0" }} {...props} />,
                        ol: ({ ...props }) => <ol style={{ listStyleType: "decimal", paddingLeft: "1.5em", margin: "4px 0" }} {...props} />,
                        li: ({ ...props }) => <li style={{ marginBottom: "2px" }} {...props} />,
                        h1: ({ ...props }) => <h1 style={{ fontWeight: 600, fontSize: "1.2em", margin: "8px 0 4px 0" }} {...props} />,
                        h2: ({ ...props }) => <h2 style={{ fontWeight: 600, fontSize: "1.1em", margin: "8px 0 4px 0" }} {...props} />,
                        h3: ({ ...props }) => <h3 style={{ fontWeight: 600, fontSize: "1.05em", margin: "8px 0 4px 0" }} {...props} />,
                        blockquote: ({ children, ...props }) => {
                          const plainText = extractMarkdownText(children);
                          return (
                            <div style={{ margin: "6px 0" }}>
                              <blockquote
                                {...props}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleLocateQuote(plainText);
                                }}
                                style={{
                                  margin: 0,
                                  borderLeft: "2px solid hsl(var(--muted-foreground) / 0.4)",
                                  paddingLeft: 10,
                                  fontSize: 13,
                                  color: "hsl(var(--muted-foreground))",
                                  lineHeight: 1.5,
                                  cursor: "pointer",
                                  transition: "opacity 0.2s",
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                              >
                                {children}
                              </blockquote>
                            </div>
                          );
                        }
                      }}
                    >
                      {completion}
                    </ReactMarkdown>
                    <span
                      style={{
                        display: "inline-block",
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        backgroundColor: "hsl(var(--muted-foreground))",
                        marginLeft: 4,
                        verticalAlign: "middle",
                        animation: "blink-cursor 1s infinite",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Thinking State */}
              <AnimatePresence mode="wait">
                {isLoading && !completion && (
                  <motion.div
                    key="thinking"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "12px 16px",
                      fontSize: 13,
                      color: "hsl(var(--muted-foreground))",
                    }}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    <GripIcon loop style={{ width: 16, height: 16 }} />
                    <DynamicThinking messages={["Thinking", "Analyzing history", "Drafting response"]} />
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input Area Overlay — Chat with Page style */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            background: "linear-gradient(to top, hsl(var(--background) / 1) 40%, transparent 100%)",
            pointerEvents: "none",
            paddingTop: 32,
          }}
        >
          <div style={{ pointerEvents: "auto", padding: "8px 12px 12px" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                border: "1px solid hsl(var(--border))",
                borderRadius: 24,
                backgroundColor: "hsl(var(--card))",
                transition: "border-color 200ms, box-shadow 200ms",
                overflow: "hidden",
              }}
            >
              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder={noteId === "general" || wordCount === 0 ? "Ask anything..." : "Ask anything about this note..."}
                rows={1}
                style={{
                  width: "100%",
                  minHeight: 44,
                  padding: "16px 16px 8px 16px",
                  fontSize: 14,
                  lineHeight: 1.5,
                  border: "none",
                  backgroundColor: "transparent",
                  color: "hsl(var(--foreground))",
                  resize: "none",
                  outline: "none",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />

              {/* Bottom Actions Bar */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  padding: "4px 8px 8px 8px",
                }}
              >
                <button
                  onClick={handleSubmit}
                  disabled={!hasValue || isLoading}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    border: "none",
                    backgroundColor: hasValue ? "hsl(var(--primary))" : "hsl(var(--muted))",
                    color: hasValue ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                    cursor: hasValue ? "pointer" : "default",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s",
                    opacity: hasValue ? 1 : 0.5,
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>
                </button>
              </div>
            </div>

            {/* Disclaimer */}
            <div style={{ display: "flex", justifyContent: "center", marginTop: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", opacity: 0.6 }}>
                AI can make mistakes. Check important info.
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}

/* ===== Quick Actions ===== */
const QUICK_ACTIONS = [
  { id: "summarize", label: "Summarize", icon: <AlignLeftIcon className="w-4 h-4" />, color: "hsl(280 80% 65%)", colorRgb: "168, 85, 247" },
  { id: "explain", label: "Explain", icon: <BookTextIcon className="w-4 h-4" />, color: "hsl(45 90% 55%)", colorRgb: "245, 158, 11" },
  { id: "key-takeaways", label: "Key Takeaways", icon: <CheckCheckIcon className="w-4 h-4" />, color: "hsl(160 60% 50%)", colorRgb: "16, 185, 129" },
  { id: "brainstorm", label: "Brainstorm", icon: <BrainIcon className="w-4 h-4" />, color: "hsl(210 80% 60%)", colorRgb: "59, 130, 246" },
  { id: "action-items", label: "Action Items", icon: <ClipboardCheckIcon className="w-4 h-4" />, color: "hsl(340 70% 60%)", colorRgb: "244, 63, 94" },
  { id: "fix-grammar", label: "Fix Grammar", icon: <SparklesIcon className="w-4 h-4" />, color: "hsl(20 80% 60%)", colorRgb: "249, 115, 22" },
];

function EmptyState({ noteTitle, wordCount, noteTextPreview, noteContent, onQuickAction, userName }: {
  noteTitle: string;
  wordCount: number;
  noteTextPreview: string;
  noteContent: string;
  onQuickAction: (prompt: string) => void;
  userName: string;
}) {
  const isEmptyNote = wordCount === 0;
  const [dotLottie, setDotLottie] = useState<DotLottie | null>(null);

  useEffect(() => {
    if (!dotLottie) return;

    const fireJump = () => {
      try {
        if (typeof dotLottie.stateMachineFireEvent === "function") {
          dotLottie.stateMachineFireEvent("jumpClick");
        }
      } catch (err) {}
    };

    const fireYesClick = () => {
      try {
        if (typeof dotLottie.stateMachineFireEvent === "function") {
          dotLottie.stateMachineFireEvent("yesClick");
        }
      } catch (err) {}
    };

    let interval: NodeJS.Timeout;
    const initialTimeout = setTimeout(() => {
      fireJump();
      interval = setInterval(fireYesClick, 3000);
    }, 200);

    return () => {
      clearTimeout(initialTimeout);
      if (interval) clearInterval(interval);
    };
  }, [dotLottie]);

  if (isEmptyNote) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: "0 16px",
          paddingBottom: 0,
        }}
      >
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 16 }}>
          {/* Lottie Animation */}
          <div className="w-[64px] h-[64px] flex items-center justify-center relative" style={{ clipPath: "inset(-100% -100% 0 -100%)" }}>
            <DotLottieReact
              src={chrome.runtime.getURL("ai-robo.lottie")}
              autoplay
              loop
              stateMachineId="StateMachine1"
              dotLottieRefCallback={setDotLottie}
              backgroundColor="transparent"
              style={{ width: "150%", height: "150%", transform: "scale(1.35) translateY(2%)", position: "absolute" }}
            />
          </div>
          
          <div style={{ textAlign: "center", fontSize: 22, fontWeight: 600, color: "hsl(var(--foreground))" }}>
            Hi {userName} 👋<br />Where should we start?
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
        padding: "0 16px",
        gap: 16,
      }}
    >
      {/* Lottie Animation instead of Icon */}
      <div className="w-[64px] h-[64px] flex items-center justify-center relative" style={{ clipPath: "inset(-100% -100% 0 -100%)" }}>
        <DotLottieReact
          src={chrome.runtime.getURL("ai-robo.lottie")}
          autoplay
          loop
          stateMachineId="StateMachine1"
          dotLottieRefCallback={setDotLottie}
          backgroundColor="transparent"
          style={{ width: "150%", height: "150%", transform: "scale(1.35) translateY(2%)", position: "absolute" }}
        />
      </div>

      {/* Title */}
      <div style={{ textAlign: "center", fontSize: 18, fontWeight: 600, color: "hsl(var(--foreground))" }}>
        Ask anything about this note
      </div>

      {/* Note Info Card — gradient border */}
      {noteTitle && (
        <div
          className="animated-gradient-border"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: 12,
            width: "100%",
            textAlign: "left",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--foreground))", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {noteTitle}
          </div>
          <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", display: "flex", alignItems: "center", gap: 6 }}>
            <span>BlackNote</span>
            <span>•</span>
            <span>{wordCount > 0 ? `${wordCount} words` : "Empty note"}</span>
          </div>
          {noteTextPreview && (
            <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {noteTextPreview}
            </div>
          )}
        </div>
      )}

      {/* Action Grid — radial gradient separator + spotlight hover */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          marginTop: 8,
          width: "100%",
          gap: 1,
          background: "radial-gradient(ellipse at center, hsl(var(--border) / 0.5) 0%, transparent 80%)",
          padding: 1,
        }}
      >
        {QUICK_ACTIONS.map((action, index) => (
          <ActionItem
            key={action.id}
            action={action}
            index={index}
            total={QUICK_ACTIONS.length}
            onAction={() => onQuickAction(`${action.label} this note`)}
          />
        ))}
      </div>
    </div>
  );
}

function ActionItem({ action, index, total, onAction }: {
  action: { id: string; label: string; icon: React.ReactNode; color: string; colorRgb: string };
  index: number;
  total: number;
  onAction: () => void;
}) {
  const iconRef = useRef<any>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  const isLeftColumn = index % 2 === 0;
  const isLastRow = index >= total - 2;

  const animatedIcon = React.isValidElement(action.icon)
    ? React.cloneElement(action.icon, { ref: iconRef } as any)
    : action.icon;

  return (
    <button
      onClick={onAction}
      onMouseEnter={() => { setIsHovering(true); iconRef.current?.startAnimation?.(); }}
      onMouseLeave={() => { setIsHovering(false); iconRef.current?.stopAnimation?.(); }}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
      style={{
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        backgroundColor: "hsl(var(--background))",
        border: "none",
        color: "hsl(var(--foreground))",
        cursor: "pointer",
        transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        textAlign: "left",
        width: "100%",
        fontFamily: "inherit",
        borderTopLeftRadius: index === 0 ? 11 : 0,
        borderTopRightRadius: index === 1 ? 11 : 0,
        borderBottomLeftRadius: isLeftColumn && isLastRow ? 11 : 0,
        borderBottomRightRadius: !isLeftColumn && isLastRow ? 11 : 0,
      }}
      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "hsl(var(--accent))")}
      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "hsl(var(--background))")}
    >
      <div className="novel-slash-icon" style={{
        background: `linear-gradient(135deg, rgba(${action.colorRgb}, var(--icon-bg-start)) 0%, rgba(${action.colorRgb}, var(--icon-bg-end)) 100%)`,
        border: `1px solid rgba(${action.colorRgb}, var(--icon-border))`,
        color: `rgba(${action.colorRgb}, 1)`,
        zIndex: 1
      }}>
        <AnimatedIcon animation="hover">
          {animatedIcon}
        </AnimatedIcon>
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, zIndex: 1 }}>{action.label}</div>

      {/* Spotlight Hover Overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle 70px at ${mouse.x}px ${mouse.y}px, ${action.color}, transparent 100%)`,
          opacity: isHovering ? 0.15 : 0,
          transition: "opacity 0.3s ease",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />
    </button>
  );
}

/* ===== Action Button with Tooltip ===== */
function ActionButtonWithTooltip({ icon, label, onClick, isActive = false }: { icon: React.ReactNode, label: string, onClick: () => void, isActive?: boolean }) {
  const [showTooltip, setShowTooltip] = useState(false);
  
  return (
    <div style={{ position: "relative", display: "inline-flex" }} onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
      <button
        onClick={onClick}
        style={{
          padding: "3px 6px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          borderRadius: 4,
          color: "hsl(var(--muted-foreground))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: isActive ? 1 : 0.5,
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = isActive ? "1" : "0.5"; }}
      >
        {icon}
      </button>
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 5, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 2, x: "-50%" }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              bottom: "100%",
              left: "50%",
              marginBottom: 4,
              padding: "4px 8px",
              backgroundColor: "hsl(var(--foreground))",
              color: "hsl(var(--background))",
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 4,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            {label}
            <div
              style={{
                position: "absolute",
                bottom: -3,
                left: "50%",
                transform: "translateX(-50%) rotate(45deg)",
                width: 6,
                height: 6,
                backgroundColor: "hsl(var(--foreground))",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
