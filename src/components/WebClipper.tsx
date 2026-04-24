/**
 * WebClipper — Sidebar component for clipping the current page.
 * ALL actions go through AI → auto-save to a NEW note.
 */

import { useState } from "react";
import {
  Loader2, Globe, FileText, Sparkles, Brain, X, AlertCircle,
} from "lucide-react";
import { useWebClipper } from "@/hooks/use-web-clipper";
import { prepareForAI } from "@/lib/page-reader";
import { supabase } from "@/lib/supabase";
import { AI_API_BASE } from "@/lib/constants";

interface WebClipperProps {
  onSaveAsNote: (title: string, markdown: string) => void;
  onClose: () => void;
}

const PROCESSING_LABELS: Record<string, string> = {
  clean_page: "Cleaning page...",
  summarize_page: "Summarizing...",
  mindmap: "Generating mindmap...",
  extract_key_points: "Extracting key points...",
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
          <Globe className="w-4 h-4" style={{ color: "hsl(var(--muted-foreground))" }} />
          <span className="web-clipper-title">Clip Page</span>
        </div>
        <button className="web-clipper-close" onClick={handleClose} data-tooltip="Close">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Extracting */}
      {status === "clipping" && (
        <div className="web-clipper-loading">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "hsl(var(--muted-foreground))" }} />
          <span>Reading page...</span>
        </div>
      )}

      {/* Extract error */}
      {status === "error" && (
        <div className="web-clipper-loading">
          <AlertCircle className="w-4 h-4 shrink-0" style={{ color: "hsl(var(--muted-foreground))" }} />
          <span>Page not supported</span>
        </div>
      )}

      {/* AI processing */}
      {processing && (
        <div className="web-clipper-processing">
          <span className="web-clipper-processing-dot" />
          <span>{PROCESSING_LABELS[processing] || "Processing..."}</span>
        </div>
      )}

      {/* Process error */}
      {processError && !processing && (
        <div className="web-clipper-error">
          <AlertCircle className="w-4 h-4 shrink-0" />
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

          <div className="web-clipper-actions">
            <button
              className="web-clipper-action-btn web-clipper-action-primary"
              onClick={() => handleAction("clean_page")}
            >
              <FileText className="w-3.5 h-3.5" />
              Save as Note
            </button>
            <button
              className="web-clipper-action-btn"
              onClick={() => handleAction("summarize_page")}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Summarize
            </button>
            <button
              className="web-clipper-action-btn"
              onClick={() => handleAction("mindmap")}
            >
              <Brain className="w-3.5 h-3.5" />
              Mindmap
            </button>
            <button
              className="web-clipper-action-btn"
              onClick={() => handleAction("extract_key_points")}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Key Points
            </button>
          </div>
        </>
      )}
    </div>
  );
}
