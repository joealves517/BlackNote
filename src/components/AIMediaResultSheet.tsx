/**
 * AIMediaResultSheet — Redesigned bottom sheet that perfectly reuses the 
 * AI Selector clipper-sheet layout:
 * - Rounded 20px corners, bottom sheet spring slide animation.
 * - Backdrop blur, clean Monochrome design.
 * - Display static markdown AI Media results instantly (no streaming).
 * - Portaled to #blacknote-root or body to prevent z-index/overflow issues.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "framer-motion";
import { ClipboardCheckIcon } from "@/components/icons/clipboard-check";
import { CheckIcon } from "@/components/icons/check";
import { MessageSquareIcon } from "@/components/icons/message-square";
import { GripIcon } from "@/components/icons/grip";
import { DynamicThinking } from "@/components/ui/dynamic-thinking";
import type { SummaryResult } from "@/lib/media-ai-service";

interface AIMediaResultSheetProps {
  title: string;
  result: SummaryResult | null;
  loading: boolean;
  error: string | null;
  onInsertToNote?: (text: string) => void;
  onClose: () => void;
}

export function AIMediaResultSheet({
  title,
  result,
  loading,
  error,
  onInsertToNote,
  onClose,
}: AIMediaResultSheetProps) {
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleCopy = useCallback(() => {
    if (!result?.text) return;
    navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [result?.text]);

  const handleInsert = useCallback(() => {
    if (!result?.text || !onInsertToNote) return;

    // Build markdown with keyframe images if available
    let markdown = result.text;
    if (result.keyframes && result.keyframes.length > 0) {
      markdown += "\n\n---\n\n### Key Moments\n\n";
      for (const kf of result.keyframes) {
        const time = formatTimestamp(kf.time);
        markdown += `**${time}** — ${kf.label}\n\n`;
      }
    }
    onInsertToNote(markdown);
    onClose();
  }, [result, onInsertToNote, onClose]);

  // Focus and handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const portalTarget = document.getElementById("blacknote-root") || document.body;

  return createPortal(
    <>
      {/* Backdrop overlay */}
      <motion.div
        className="history-sheet-backdrop"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />

      {/* Clipper Sheet (Reused design of AI Selector) */}
      <motion.div
        className="clipper-sheet mx-auto"
        style={{ 
          maxHeight: "calc(100% - 56px)",
          maxWidth: 600,
          borderRadius: "24px 24px 0 0",
        }}
        initial={{ bottom: "-100%" }}
        animate={{ bottom: 0 }}
        exit={{ bottom: "-100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 350, mass: 0.8 }}
      >
        {/* Drag Handle Bar */}
        <div className="history-sheet-handle" onClick={onClose}>
          <div className="history-sheet-handle-bar" />
        </div>

        {/* Content Wrapper */}
        <div className="clipper-sheet-content flex flex-col min-h-0 select-text px-4 pb-4 pt-1">
          {/* Body Area */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto pr-1 pb-4 custom-scrollbar min-h-0"
          >
            {/* Loading state */}
            {loading && !result && (
              <div className="flex flex-col items-center justify-center gap-3 py-10">
                <GripIcon loop className="w-5 h-5 text-zinc-400" />
                <DynamicThinking
                  messages={[
                    "Structuring content...",
                    "Polishing formatting...",
                    "Finalizing result...",
                  ]}
                />
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold text-center my-4">
                {error}
              </div>
            )}

            {/* AI Generated Markdown Result */}
            {result && (
              <div className="chat-message-ai text-[13px] text-foreground dark:text-zinc-200 leading-relaxed space-y-3 selection:bg-zinc-200 dark:selection:bg-zinc-800 pr-1">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ ...props }) => <p className="leading-relaxed mb-2.5" {...props} />,
                    ul: ({ ...props }) => <ul className="list-disc pl-5 space-y-1 mb-2.5" {...props} />,
                    ol: ({ ...props }) => <ol className="list-decimal pl-5 space-y-1 mb-2.5" {...props} />,
                    blockquote: ({ ...props }) => (
                      <blockquote className="border-l-[3px] border-zinc-300 dark:border-zinc-700 pl-3 text-zinc-500 dark:text-zinc-400 my-2.5 italic" {...props} />
                    ),
                    li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
                    h1: ({ ...props }) => <h1 className="text-base font-bold text-foreground mt-4 mb-2" {...props} />,
                    h2: ({ ...props }) => <h2 className="text-[14px] font-bold text-foreground mt-3 mb-2" {...props} />,
                    h3: ({ ...props }) => <h3 className="text-[13px] font-bold text-foreground mt-3 mb-1.5" {...props} />,
                  }}
                >
                  {result.text}
                </ReactMarkdown>
              </div>
            )}

            {/* Video/Audio Keyframe images */}
            {result && result.keyframes && result.keyframes.length > 0 && (
              <div className="mt-6 border-t border-zinc-200/50 dark:border-zinc-800/50 pt-5">
                <div className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">
                  Key Moments
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {result.keyframes.map((kf, i) => (
                    <div
                      key={i}
                      className="rounded-xl overflow-hidden border border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50 dark:bg-zinc-900/30 flex flex-col"
                    >
                      <img
                        src={kf.imageDataUrl}
                        alt={kf.label}
                        className="w-full aspect-[16/9] object-cover block border-b border-zinc-200/40 dark:border-zinc-800/40"
                      />
                      <div className="p-2 flex flex-col gap-0.5">
                        <span className="text-[10px] font-bold text-zinc-800 dark:text-zinc-300">
                          {formatTimestamp(kf.time)}
                        </span>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
                          {kf.label}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sticky Bottom Actions Bar */}
          {result && (
            <div className="flex items-center gap-3 pt-3.5 border-t border-zinc-200/40 dark:border-zinc-800/40 shrink-0 bg-background/50 backdrop-blur-sm">
              <button
                onClick={handleCopy}
                className="flex-1 h-10 flex items-center justify-center gap-2 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-900/40 dark:hover:bg-zinc-800/80 text-foreground text-xs font-semibold transition-colors cursor-pointer"
              >
                {copied ? (
                  <CheckIcon className="w-3.5 h-3.5 text-zinc-700 dark:text-zinc-300" />
                ) : (
                  <ClipboardCheckIcon className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>

              {onInsertToNote && (
                <button
                  onClick={handleInsert}
                  className="flex-1 h-10 flex items-center justify-center gap-2 rounded-xl bg-zinc-900 hover:bg-zinc-850 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-zinc-50 dark:text-zinc-900 text-xs font-semibold transition-colors cursor-pointer"
                >
                  <MessageSquareIcon className="w-3.5 h-3.5" />
                  Insert to Note
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </>,
    portalTarget
  );
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
