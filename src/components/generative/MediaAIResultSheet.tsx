/**
 * MediaAIResultSheet — Reuses AISelector layout to display media AI results.
 * Shows: result preview + "Insert below" / "Discard" actions + prompt input for follow-up.
 * No "Replace selection" — media AI content always inserts below the media node.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { useCompletion } from "@ai-sdk/react";
import { useEditor } from "novel";
import Markdown from "react-markdown";
import { ArrowUpIcon } from "@/components/icons/arrow-up";
import { MessageSquareIcon } from "@/components/icons/message-square";
import { DeleteIcon } from "@/components/icons/delete";
import { GripIcon } from "@/components/icons/grip";
import { GeminiIcon } from "./GeminiIcon";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import { DynamicThinking } from "@/components/ui/dynamic-thinking";
import { markdownToProsemirror } from "@/lib/markdown-to-prosemirror";
import { supabase } from "@/lib/supabase";
import { AI_API_BASE } from "@/lib/constants";

interface MediaAIResultSheetProps {
  completion: string;
  mediaId: string;
  onClose: () => void;
}

export function MediaAIResultSheet({ completion: initialResult, mediaId, onClose }: MediaAIResultSheetProps) {
  const { editor } = useEditor();
  const [inputValue, setInputValue] = useState("");
  const [displayText, setDisplayText] = useState(initialResult);
  const [token, setToken] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token || null);
    });
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const { completion: followUp, complete, isLoading } = useCompletion({
    api: token ? `${AI_API_BASE}/api/ai` : `${AI_API_BASE}/api/ai/free`,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    streamProtocol: "text",
    onError: () => {
      window.dispatchEvent(new CustomEvent("ai-error"));
    },
    onFinish: (_prompt, comp) => {
      if (comp) setDisplayText(comp);
    },
  });

  // Show streaming follow-up if active, otherwise show initial/last result
  const visibleText = (isLoading && followUp) ? followUp : displayText;
  const isThinking = isLoading && !followUp;

  const handleSubmit = () => {
    if (!inputValue.trim() || isLoading) return;
    complete(displayText, {
      body: { option: "zap", command: inputValue },
    }).then(() => setInputValue(""));
  };

  const parseAndInsert = (text: string) => {
    if (!editor) return;

    // Find media node and insert after it
    let insertPos = editor.state.doc.content.size;
    editor.state.doc.descendants((node, pos) => {
      if (
        (node.type.name === "audioNode" || node.type.name === "videoNode") &&
        node.attrs.mediaId === mediaId
      ) {
        insertPos = pos + node.nodeSize;
        return false;
      }
    });

    try {
      const jsonStr = markdownToProsemirror(text);
      const json = JSON.parse(jsonStr);
      const parsed = json.content || text;
      editor.chain().focus().insertContentAt(insertPos, parsed).run();
    } catch {
      editor.chain().focus().insertContentAt(insertPos, text).run();
    }
  };

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => { autoResize(); }, [inputValue, autoResize]);

  const portalTarget = document.getElementById("blacknote-root") || document.body;

  return createPortal(
    <>
      <motion.div
        className="history-sheet-backdrop"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />

      <motion.div
        className="clipper-sheet"
        style={{ maxHeight: "calc(100% - 56px)" }}
        initial={{ bottom: "-100%" }}
        animate={{ bottom: 0 }}
        exit={{ bottom: "-100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 350, mass: 0.8 }}
      >
        <div className="history-sheet-handle" onClick={onClose}>
          <div className="history-sheet-handle-bar" />
        </div>

        <motion.div
          className="clipper-sheet-content"
          style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
        >
          {/* ─── Thinking State ─── */}
          <AnimatePresence mode="wait">
            {isThinking && (
              <div key="thinking" className="ai-loading" style={{ height: "40px", opacity: 0 }}></div>
            )}
          </AnimatePresence>

          {/* ─── Result Preview ─── */}
          <AnimatePresence>
            {!isThinking && visibleText && (
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
                    <Markdown>{visibleText}</Markdown>
                  </div>
                </div>

                {isLoading && (
                  <div className="ai-loading ai-loading-inline">
                    <GripIcon loop className="ai-loading-icon" />
                    <DynamicThinking messages={["Writing", "Generating content", "Refining"]} interval={1500} />
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ─── Input + Actions ─── */}
          {!isThinking && (
            <motion.div>
              <div className="ai-input-row">
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  rows={1}
                  placeholder="Tell AI what to do next..."
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

              {/* Action buttons — Insert below only (no Replace) */}
              <div className="ai-cmd-groups">
                <div className="ai-cmd-group">
                  <button
                    className="ai-cmd-item"
                    onClick={() => {
                      parseAndInsert(visibleText);
                      onClose();
                    }}
                  >
                    <MessageSquareIcon className="ai-cmd-icon" />
                    Insert below
                  </button>
                  <button className="ai-cmd-item ai-cmd-discard" onClick={onClose}>
                    <DeleteIcon className="ai-cmd-icon" />
                    Discard
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </>,
    portalTarget
  );
}
