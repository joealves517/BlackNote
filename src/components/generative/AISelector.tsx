import { ArrowUpIcon } from "@/components/icons/arrow-up";
import { GripIcon } from "@/components/icons/grip";
import { useCompletion } from "@ai-sdk/react";

import { useEditor, addAIHighlight, removeAIHighlight } from "novel";
import { useState, useEffect, useRef, useCallback } from "react";
import Markdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { AISelectorCommands } from "./AISelectorCommands";
import { AICompletionCommands } from "./AICompletionCommands";
import { GeminiIcon } from "./GeminiIcon";
import { supabase } from "@/lib/supabase";
import { AI_API_BASE } from "@/lib/constants";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";

interface AISelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ThinkingDots() {
  const [dotCount, setDotCount] = useState(1);
  useEffect(() => {
    const timer = setInterval(() => {
      setDotCount((prev) => (prev % 3) + 1);
    }, 400);
    return () => clearInterval(timer);
  }, []);
  return <span className="ai-thinking-dots">{".".repeat(dotCount)}</span>;
}

// Shared spring config for all layout transitions
const smoothSpring = { type: "spring", damping: 28, stiffness: 300, mass: 0.8 } as const;

export function AISelector({ onOpenChange }: AISelectorProps) {
  const { editor } = useEditor();
  const [inputValue, setInputValue] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token || null);
    });
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
      window.dispatchEvent(new CustomEvent("ai-error"));
    },
    onFinish: (_prompt, comp) => {
      if (comp.includes("Your credit has been refunded")) {
        window.dispatchEvent(new CustomEvent("ai-error-refunded"));
      } else if (comp.includes("⚠️ AI is currently busy")) {
        window.dispatchEvent(new CustomEvent("ai-error"));
      }
    },
  });

  const hasCompletion = completion.length > 0;

  const getSelectedText = (): string => {
    if (!editor) return "";
    const slice = editor.state.selection.content();
    if (slice.size === 0) {
      return (
        editor.storage.markdown?.serializer?.serialize(editor.state.doc.content) ||
        editor.state.doc.textContent
      );
    }
    return (
      editor.storage.markdown?.serializer?.serialize(slice.content) ||
      slice.content.textBetween(0, slice.content.size, "\n")
    );
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
        layout
        layoutDependency={visualState}
      >
        <div className="history-sheet-handle" onClick={handleClose}>
          <div className="history-sheet-handle-bar" />
        </div>

        <motion.div
          className="clipper-sheet-content"
          layout
          transition={smoothSpring}
        >
          {/* ─── Thinking State ─── */}
          <AnimatePresence mode="wait">
            {visualState === "thinking" && (
              <motion.div
                key="thinking"
                className="ai-loading"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <GripIcon loop className="ai-loading-icon" />
                <span>AI is thinking<ThinkingDots /></span>
              </motion.div>
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
              >
                <div className="ai-response-preview">
                  <div className="ai-response-content">
                    <Markdown>{completion}</Markdown>
                  </div>
                </div>

                {isLoading && (
                  <div className="ai-loading ai-loading-inline">
                    <GripIcon loop className="ai-loading-icon" />
                    <span>Writing<ThinkingDots /></span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ─── Input + Commands (visible when not thinking) ─── */}
          {visualState !== "thinking" && (
            <motion.div layout transition={smoothSpring}>
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
