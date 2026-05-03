import { EarthIcon } from "@/components/icons/earth";
import { GripIcon } from "@/components/icons/grip";
import { LoaderCircleIcon } from "@/components/icons/loader-circle";
import { CircleHelpIcon } from "@/components/icons/circle-help";
import { ClipboardCheckIcon } from "@/components/icons/clipboard-check";
import { FileTextIcon } from "@/components/icons/file-text";
import { SparklesIcon } from "@/components/icons/sparkles";
import { BrainIcon } from "@/components/icons/brain";
import { XIcon } from "@/components/icons/x";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import { openSparkAI } from "@/lib/ecosystem";
import sparkAIIcon from "@/assets/spark-ai-icon.png";
/**
 * WebClipper — Sidebar component for clipping the current page.
 * ALL actions go through AI → auto-save to a NEW note.
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { useWebClipper } from "@/hooks/use-web-clipper";
import { prepareForAI } from "@/lib/page-reader";
import { supabase } from "@/lib/supabase";
import { AI_API_BASE } from "@/lib/constants";

interface WebClipperProps {
  onSaveAsNote: (title: string, markdown: string) => void;
  onClose: () => void;
}

function AnimatedDots() {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return <span>{dots}</span>;
}

const PROCESSING_LABELS: Record<string, string> = {
  clean_page: "Cleaning page",
  summarize_page: "Summarizing",
  mindmap: "Generating mindmap",
  extract_key_points: "Extracting key points",
  spark_sent: "Sent to Spark AI! Click ✦ icon in toolbar to open",
};

const TITLE_PREFIXES: Record<string, string> = {
  clean_page: "",
  summarize_page: "Summary: ",
  mindmap: "Mindmap: ",
  extract_key_points: "Key Points: ",
};

/** Stream AI completion from backend */
async function streamAI(
  markdown: string,
  option: string,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (msg: string) => void,
) {
  try {
    let token: string | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token || null;
    } catch {
      token = null;
    }

    const endpoint = token
      ? `${AI_API_BASE}/api/ai`
      : `${AI_API_BASE}/api/ai/free`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ prompt: markdown, option }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI error (${response.status}): ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response stream");

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onToken(decoder.decode(value, { stream: true }));
    }
    onDone();
  } catch (err) {
    onError(err instanceof Error ? err.message : "AI request failed");
  }
}

export function WebClipper({ onSaveAsNote, onClose }: WebClipperProps) {
  const { clip, status, content, error, reset } = useWebClipper();
  const [processing, setProcessing] = useState<string | null>(null);
  const [processError, setProcessError] = useState("");

  // Auto-clip on mount
  if (status === "idle") {
    clip();
  }

  const handleAction = (option: string) => {
    if (!content) return;
    setProcessing(option);
    setProcessError("");

    const prepared = prepareForAI(content.markdown);
    let result = "";

    streamAI(
      prepared,
      option,
      (token) => { result += token; },
      () => {
        // Extract title from AI output (first # heading)
        const titleMatch = result.match(/^#\s+(.+)$/m);
        const prefix = TITLE_PREFIXES[option] || "";

        let title: string;
        if (titleMatch) {
          title = titleMatch[1];
        } else {
          // Truncate page title to keep it short
          const shortPageTitle = content.title.length > 40
            ? content.title.slice(0, 40).trim() + "…"
            : content.title;
          title = `${prefix}${shortPageTitle}`;
        }

        const body = `> Source: [${content.siteName}](${content.url})\n\n${result}`;

        onSaveAsNote(title, body);
        reset();
        setProcessing(null);
        onClose();
      },
      (msg) => {
        setProcessing(null);
        // Trigger upgrade modal for credit/auth errors
        if (msg.includes("402") || msg.includes("insufficient") || msg.includes("401")) {
          window.dispatchEvent(new CustomEvent("ai-error"));
          onClose();
        } else {
          setProcessError(msg);
        }
      },
    );
  };

  /** Open Spark AI to chat about the current page */
  const handleChatWithPage = async () => {
    if (!content) return;
    const success = await openSparkAI();
    if (success) {
      setProcessing("spark_sent");
      // Auto-close after a brief delay so user can see the confirmation
      setTimeout(() => {
        setProcessing(null);
        onClose();
      }, 2500);
    } else {
      // Spark AI is not installed — open Web Store
      chrome.tabs.create({
        url: "https://chromewebstore.google.com/detail/spark-ai/cainihlnefiebaigcjiniandhodkajaj",
      });
      onClose();
    }
  };

  const handleClose = () => {
    reset();
    setProcessing(null);
    onClose();
  };

  return (
    <div className="web-clipper">
      {/* Header */}
      <div className="web-clipper-header">
        <div className="web-clipper-header-left">
          {content?.url ? (
            <img
              src={`https://www.google.com/s2/favicons?domain=${new URL(content.url).hostname}&sz=32`}
              alt=""
              className="w-4 h-4 rounded-[3px]"
            />
          ) : (
            <EarthIcon className="w-4 h-4" style={{ color: "hsl(var(--muted-foreground))" }} />
          )}
          <span className="web-clipper-title">Clip Page</span>
        </div>
      </div>

      {/* Extracting */}
      {status === "clipping" && (
        <div className="web-clipper-loading">
          <LoaderCircleIcon className="w-4 h-4 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
          <span>Reading page...</span>
        </div>
      )}

      {/* Extract error */}
      {status === "error" && (
        <div className="web-clipper-loading">
          <CircleHelpIcon className="w-4 h-4 shrink-0" style={{ color: "hsl(var(--muted-foreground))" }} />
          <span>Page not supported</span>
        </div>
      )}

      {/* AI processing */}
      <AnimatePresence mode="wait">
        {processing && (
          <motion.div
            key="processing"
            className="ai-loading"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {processing === "spark_sent" ? (
              <>
                <SparklesIcon className="ai-loading-icon" style={{ color: "#22c55e" }} />
                <span style={{ color: "#22c55e" }}>
                  {PROCESSING_LABELS[processing]}
                </span>
              </>
            ) : (
              <>
                <GripIcon loop className="ai-loading-icon" />
                <span>
                  {PROCESSING_LABELS[processing] || "Processing"}
                  <AnimatedDots />
                </span>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Process error */}
      {processError && !processing && (
        <div className="web-clipper-error">
          <CircleHelpIcon className="w-4 h-4 shrink-0" />
          <span>{processError}</span>
        </div>
      )}

      {/* Ready — show preview + actions */}
      {status === "done" && content && !processing && (
        <>
          <div className="web-clipper-preview">
            <h4 className="web-clipper-preview-title">{content.title}</h4>
            <div className="web-clipper-preview-meta">
              <span>{content.siteName}</span>
              <span>·</span>
              <span>{content.wordCount.toLocaleString()} words</span>
            </div>
            {content.excerpt && (
              <p className="web-clipper-preview-excerpt">{content.excerpt}</p>
            )}
          </div>

          <div className="ai-cmd-groups">
            <div className="ai-cmd-group">
              <button
                className="novel-slash-item w-full text-left"
                onClick={() => handleAction("clean_page")}
              >
                <div className="novel-slash-icon">
                  <AnimatedIcon animation="hover">
                    <FileTextIcon className="w-4 h-4" />
                  </AnimatedIcon>
                </div>
                <div>
                  <p className="text-[13px] font-medium">Save as Note</p>
                  <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                    Extract readable text and images
                  </p>
                </div>
              </button>
              
              <button
                className="novel-slash-item w-full text-left"
                onClick={() => handleAction("summarize_page")}
              >
                <div className="novel-slash-icon">
                  <AnimatedIcon animation="hover">
                    <SparklesIcon className="w-4 h-4" />
                  </AnimatedIcon>
                </div>
                <div>
                  <p className="text-[13px] font-medium">Summarize</p>
                  <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                    Generate a brief overview
                  </p>
                </div>
              </button>

              <button
                className="novel-slash-item w-full text-left"
                onClick={() => handleAction("mindmap")}
              >
                <div className="novel-slash-icon">
                  <AnimatedIcon animation="hover">
                    <BrainIcon className="w-4 h-4" />
                  </AnimatedIcon>
                </div>
                <div>
                  <p className="text-[13px] font-medium">Mindmap</p>
                  <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                    Visualize page structure
                  </p>
                </div>
              </button>

              <button
                className="novel-slash-item w-full text-left"
                onClick={() => handleAction("extract_key_points")}
              >
                <div className="novel-slash-icon">
                  <AnimatedIcon animation="hover">
                    <ClipboardCheckIcon className="w-4 h-4" />
                  </AnimatedIcon>
                </div>
                <div>
                  <p className="text-[13px] font-medium">Key Points</p>
                  <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                    Extract main ideas
                  </p>
                </div>
              </button>

              {/* Chat with Page — powered by Spark AI */}
              <button
                className="novel-slash-item w-full text-left"
                onClick={handleChatWithPage}
              >
                <div className="novel-slash-icon">
                  <AnimatedIcon animation="hover">
                    <img src={sparkAIIcon} className="w-4 h-4" alt="Spark AI" />
                  </AnimatedIcon>
                </div>
                <div>
                  <p className="text-[13px] font-medium">Chat with Page</p>
                  <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                    Ask AI about this page · Spark AI
                  </p>
                </div>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

