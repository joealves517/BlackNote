/**
 * AIMediaResultSheet — Bottom sheet displaying AI analysis results for media.
 * Supports: text results (markdown), inline keyframe images, and action buttons.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
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

  // Auto-scroll when content updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [result?.text]);

  return (
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
        className="history-sheet"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
        style={{
          display: "flex",
          flexDirection: "column",
          maxWidth: 800,
          margin: "0 auto",
        }}
      >
        {/* Drag Handle */}
        <div className="history-sheet-handle" onClick={onClose}>
          <div className="history-sheet-handle-bar" />
        </div>

        {/* Header */}
        <div
          style={{
            padding: "0 16px 12px",
            borderBottom: "1px solid hsl(var(--border) / 0.5)",
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "hsl(var(--foreground))",
            }}
          >
            {title}
          </div>
        </div>

        {/* Content */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
          }}
        >
          {/* Loading state */}
          {loading && !result && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                padding: "40px 0",
              }}
            >
              <GripIcon loop style={{ width: 20, height: 20 }} />
              <DynamicThinking
                messages={[
                  "Analyzing content",
                  "Processing transcript",
                  "Generating insights",
                ]}
              />
            </div>
          )}

          {/* Error state */}
          {error && (
            <div
              style={{
                padding: "20px",
                borderRadius: 12,
                backgroundColor: "hsl(var(--destructive) / 0.1)",
                color: "hsl(var(--destructive))",
                fontSize: 14,
                textAlign: "center",
              }}
            >
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <>
              {/* Markdown text */}
              <div className="chat-message-ai" style={{ fontSize: 14, lineHeight: 1.7 }}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ ...props }) => (
                      <p
                        style={{
                          margin: "6px 0",
                          fontSize: 14,
                          lineHeight: 1.7,
                        }}
                        {...props}
                      />
                    ),
                    ul: ({ ...props }) => <ul style={{ listStyleType: "disc", paddingLeft: "1.5em", margin: "4px 0" }} {...props} />,
                    ol: ({ ...props }) => <ol style={{ listStyleType: "decimal", paddingLeft: "1.5em", margin: "4px 0" }} {...props} />,
                    blockquote: ({ ...props }) => <blockquote style={{ borderLeft: "2px solid hsl(var(--muted-foreground)/0.4)", paddingLeft: 8, color: "hsl(var(--muted-foreground))", margin: "4px 0" }} {...props} />,
                    li: ({ ...props }) => (
                      <li
                        style={{ marginBottom: 4, lineHeight: 1.6 }}
                        {...props}
                      />
                    ),
                    h1: ({ ...props }) => (
                      <h1
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          margin: "12px 0 6px",
                        }}
                        {...props}
                      />
                    ),
                    h2: ({ ...props }) => (
                      <h2
                        style={{
                          fontSize: 16,
                          fontWeight: 600,
                          margin: "10px 0 4px",
                        }}
                        {...props}
                      />
                    ),
                    h3: ({ ...props }) => (
                      <h3
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          margin: "8px 0 4px",
                        }}
                        {...props}
                      />
                    ),
                  }}
                >
                  {result.text}
                </ReactMarkdown>
              </div>

              {/* Keyframe images */}
              {result.keyframes && result.keyframes.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "hsl(var(--muted-foreground))",
                      marginBottom: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Key Moments
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: 8,
                    }}
                  >
                    {result.keyframes.map((kf, i) => (
                      <div
                        key={i}
                        style={{
                          borderRadius: 10,
                          overflow: "hidden",
                          border: "1px solid hsl(var(--border) / 0.5)",
                          backgroundColor: "hsl(var(--card))",
                        }}
                      >
                        <img
                          src={kf.imageDataUrl}
                          alt={kf.label}
                          style={{
                            width: "100%",
                            aspectRatio: "16/9",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                        <div style={{ padding: "6px 8px" }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: "hsl(var(--primary))",
                              marginRight: 6,
                            }}
                          >
                            {formatTimestamp(kf.time)}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              color: "hsl(var(--muted-foreground))",
                            }}
                          >
                            {kf.label}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Action Bar */}
        {result && (
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "12px 16px",
              borderTop: "1px solid hsl(var(--border) / 0.5)",
            }}
          >
            <button
              onClick={handleCopy}
              className="media-ai-action-btn"
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "10px",
                borderRadius: 10,
                border: "1px solid hsl(var(--border))",
                backgroundColor: "hsl(var(--card))",
                color: "hsl(var(--foreground))",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.2s",
              }}
            >
              {copied ? (
                <CheckIcon style={{ width: 14, height: 14 }} />
              ) : (
                <ClipboardCheckIcon style={{ width: 14, height: 14 }} />
              )}
              {copied ? "Copied!" : "Copy"}
            </button>

            {onInsertToNote && (
              <button
                onClick={handleInsert}
                className="media-ai-action-btn"
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "10px",
                  borderRadius: 10,
                  border: "none",
                  backgroundColor: "hsl(var(--primary))",
                  color: "hsl(var(--primary-foreground))",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.2s",
                }}
              >
                <MessageSquareIcon style={{ width: 14, height: 14 }} />
                Insert to Note
              </button>
            )}
          </div>
        )}
      </motion.div>
    </>
  );
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
