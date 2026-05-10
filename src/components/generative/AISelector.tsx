import { ArrowUpIcon } from "@/components/icons/arrow-up";
import { GripIcon } from "@/components/icons/grip";
import { useCompletion } from "@ai-sdk/react";

import { useEditor, addAIHighlight, removeAIHighlight } from "novel";
import { useState, useEffect, useRef, useCallback } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { DOMSerializer } from "prosemirror-model";
import TurndownService from "turndown";
import { AISelectorCommands } from "./AISelectorCommands";
import { AICompletionCommands } from "./AICompletionCommands";
import { GeminiIcon } from "./GeminiIcon";
import { getAuthToken } from "@/lib/auth-client";
import { AI_API_BASE } from "@/lib/constants";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import { SparklesIcon } from "@/components/icons/sparkles";
import { AIProcessingView } from "@/components/ui/ai-processing-view";
import { DynamicThinking } from "@/components/ui/dynamic-thinking";

interface AISelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Shared spring config for all layout transitions
const smoothSpring = { type: "spring", damping: 28, stiffness: 300, mass: 0.8 } as const;

export function AISelector({ onOpenChange }: AISelectorProps) {
  const { editor } = useEditor();
  const [inputValue, setInputValue] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getAuthToken().then(setToken);
  }, []);

  // Focus textarea without scrolling — prevents editor jump
  useEffect(() => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const { completion, complete, isLoading } = useCompletion({
    api: token ? `${AI_API_BASE}/api/ai` : `${AI_API_BASE}/api/ai/free`,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    streamProtocol: "text",
    onError: (err: Error) => {
      console.error("AI error:", err.message);
      onOpenChange(false);
      window.dispatchEvent(new CustomEvent("ai-error"));
    },
    onFinish: (_prompt, comp) => {
      if (comp.includes("Your credit has been refunded")) {
        onOpenChange(false);
        window.dispatchEvent(new CustomEvent("ai-error-refunded"));
      } else if (comp.includes("busy")) {
        onOpenChange(false);
        window.dispatchEvent(new CustomEvent("ai-error"));
      }
    },
  });

  const hasCompletion = completion.length > 0;

  const getSelectedText = (): string => {
    if (!editor) return "";
    const slice = editor.state.selection.content();
    const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

    if (slice.size === 0) {
      return turndown.turndown(editor.getHTML());
    }

    try {
      // Convert selection slice to DOM fragment then to Markdown
      const dom = DOMSerializer.fromSchema(editor.schema).serializeFragment(slice.content);
      const div = document.createElement("div");
      div.appendChild(dom);
      return turndown.turndown(div.innerHTML);
    } catch {
      // Fallback
      return slice.content.textBetween(0, slice.content.size, "\n");
    }
  };

  const handleSubmit = () => {
    if (!inputValue.trim() || isLoading) return;
    if (completion) {
      complete(completion, {
        body: { option: "zap", command: inputValue },
      }).then(() => setInputValue(""));
      return;
    }
    const text = getSelectedText();
    complete(text, {
      body: { option: "zap", command: inputValue },
    }).then(() => setInputValue(""));
  };

  // Auto-resize textarea to fit content
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [inputValue, autoResize]);

  const handleClose = () => {
    if (editor) {
      removeAIHighlight(editor);
      editor.commands.focus();
    }
    onOpenChange(false);
  };

  // Determine current visual state
  const visualState = isLoading && !hasCompletion
    ? "thinking"
    : hasCompletion
      ? "result"
      : "menu";

  useEffect(() => {
    // Left empty since we no longer dispatch ai-thinking events globally.
  }, [visualState]);

  const portalTarget = document.getElementById("blacknote-root") || document.body;

  return createPortal(
    <>
      {/* Backdrop with fade-in */}
      <motion.div
        className="history-sheet-backdrop"
        onClick={handleClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />

      {/* Sheet with slide-up — layout animation handles height changes */}
      <motion.div
        className="clipper-sheet"
        style={{ maxHeight: "calc(100% - 56px)" }}
        initial={{ bottom: "-100%" }}
        animate={{ bottom: 0 }}
        exit={{ bottom: "-100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 350, mass: 0.8 }}
      >
        <div className="history-sheet-handle" onClick={handleClose}>
          <div className="history-sheet-handle-bar" />
        </div>

        <motion.div
          className="clipper-sheet-content"
          style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
        >
          {/* ─── Thinking State ─── */}
          <AnimatePresence mode="wait">
            {visualState === "thinking" && (
              <AIProcessingView
                key="thinking"
                title="Fixing text"
                messages={["Understanding context", "Analyzing selection", "Formulating response"]}
              />
            )}
          </AnimatePresence>

          {/* ─── Result State ─── */}
          <AnimatePresence>
            {visualState === "result" && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
              >
                <div className="ai-response-preview" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                  <div className="ai-response-content">
                    <Markdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ ...props }) => <p style={{ margin: "4px 0", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }} {...props} />,
                        ul: ({ ...props }) => <ul style={{ listStyleType: "disc", paddingLeft: "1.5em", margin: "4px 0" }} {...props} />,
                        ol: ({ ...props }) => <ol style={{ listStyleType: "decimal", paddingLeft: "1.5em", margin: "4px 0" }} {...props} />,
                        li: ({ ...props }) => <li style={{ marginBottom: "2px" }} {...props} />,
                        h1: ({ ...props }) => <h1 style={{ fontWeight: 600, fontSize: "1.2em", margin: "8px 0 4px 0" }} {...props} />,
                        h2: ({ ...props }) => <h2 style={{ fontWeight: 600, fontSize: "1.1em", margin: "8px 0 4px 0" }} {...props} />,
                        h3: ({ ...props }) => <h3 style={{ fontWeight: 600, fontSize: "1.05em", margin: "8px 0 4px 0" }} {...props} />,
                        blockquote: ({ ...props }) => <blockquote style={{ borderLeft: "2px solid hsl(var(--muted-foreground)/0.4)", paddingLeft: 8, color: "hsl(var(--muted-foreground))", margin: "4px 0" }} {...props} />
                      }}
                    >
                      {completion}
                    </Markdown>
                  </div>
                </div>

                {isLoading && (
                  <div className="ai-loading ai-loading-inline">
                    <GripIcon loop className="ai-loading-icon" />
                    <DynamicThinking messages={["Writing", "Generating content", "Refining structure"]} interval={1500} />
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ─── Input + Commands (visible when not thinking) ─── */}
          {visualState !== "thinking" && (
            <motion.div>
              <div className="ai-input-row">
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  rows={1}
                  placeholder={
                    hasCompletion
                      ? "Tell AI what to do next..."
                      : "Ask AI to edit, translate, summarize..."
                  }
                  className="ai-input"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && inputValue.trim()) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                />
                <button
                  className="ai-send-btn"
                  onClick={handleSubmit}
                  disabled={!inputValue.trim() || isLoading}
                >
                  <ArrowUpIcon className="h-3.5 w-3.5" />
                </button>
              </div>

              {hasCompletion ? (
                <AICompletionCommands
                  onDiscard={handleClose}
                  completion={completion}
                />
              ) : (
                <AISelectorCommands
                  onSelect={(value, option) =>
                    complete(value, { body: { option } })
                  }
                />
              )}
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </>,
    portalTarget
  );
}
