import { GlobeIcon } from "@/components/icons/globe";
import { LoaderCircleIcon } from "@/components/icons/loader-circle";
import { CircleHelpIcon } from "@/components/icons/circle-help";
import { ClipboardCheckIcon } from "@/components/icons/clipboard-check";
import { FileTextIcon } from "@/components/icons/file-text";
import { SparklesIcon } from "@/components/icons/sparkles";
import { BrainIcon } from "@/components/icons/brain";
import { CropIcon, Download } from "lucide-react";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import { openSparkAIWithPageContent, openUrlViaBackground, ECOSYSTEM } from "@/lib/ecosystem";
import sparkAIIcon from "@/assets/spark-ai-icon.png";
import { useState, useEffect } from "react";
import { useWebClipper } from "@/hooks/use-web-clipper";
import { useHTMLClipper } from "@/hooks/use-html-clipper";
import { prepareForAI } from "@/lib/page-reader";
import { getAuthToken } from "@/lib/auth-client";
import { AI_API_BASE } from "@/lib/constants";
import { showAILoaderToast, updateAISuccessToast, updateAIErrorToast } from "@/lib/toast";

interface WebClipperProps {
  onSaveAsNote: (title: string, markdown: string) => void;
  onSaveWebClip?: (title: string, url: string, clipId: string, noteId: string) => void;
  onClose: () => void;
}

const PROCESSING_LABELS: Record<string, string> = {
  clean_page: "Cleaning page content",
  summarize_page: "Summarizing page content",
  mindmap: "Generating mindmap structure",
  extract_key_points: "Extracting key points",
  extract_todo: "Extracting to-dos and action items",
};

const TITLE_PREFIXES: Record<string, string> = {
  clean_page: "",
  summarize_page: "Summary: ",
  mindmap: "Mindmap: ",
  extract_key_points: "Key Points: ",
  extract_todo: "To-do: ",
};

async function streamAI(
  markdown: string,
  option: string,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (msg: string) => void,
) {
  try {
    const token = await getAuthToken();
    const endpoint = token ? `${AI_API_BASE}/api/ai` : `${AI_API_BASE}/api/ai/free`;

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

export function WebClipper({ onSaveAsNote, onSaveWebClip, onClose }: WebClipperProps) {
  const { clip, status, content, error, reset } = useWebClipper();
  const { clipHTML, status: htmlStatus } = useHTMLClipper();

  const handleSaveHTMLOffline = async () => {
    if (!content || !onSaveWebClip) return;

    const toastId = `html-clip-toast-${Date.now()}`;

    handleClose(); // Close the sidebar immediately, like other actions

    showAILoaderToast(toastId, "HTML Snapshot", "Saving full page snapshot...");

    try {
      const noteId = crypto.randomUUID();
      const clipId = await clipHTML(noteId);

      if (clipId) {
        onSaveWebClip(content.title, content.url, clipId, noteId);
        updateAISuccessToast(toastId, "HTML Snapshot", "Page snapshot saved successfully!");
      } else {
        updateAIErrorToast(toastId, "HTML Snapshot", "This page could not be captured. Try a simpler page.");
      }
    } catch (err: any) {
      console.error("[WebClipper] Save HTML snapshot error:", err);
      const isTimeout = err?.message?.includes("timed out");
      const errorMsg = isTimeout
        ? "Page took too long to capture. Complex pages (Gmail, Docs) may not be supported."
        : "Could not capture this page. It may have restrictions preventing snapshots.";
      updateAIErrorToast(toastId, "HTML Snapshot", errorMsg);
    }
  };

  // Auto-clip on mount
  if (status === "idle") {
    clip();
  }

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAction = (option: string) => {
    if (!content) return;

    const toastId = `web-clip-toast-${Date.now()}`;
    const featureLabel = PROCESSING_LABELS[option] || "Clipping Page";

    handleClose(); // Close the sidebar immediately!

    showAILoaderToast(toastId, "Clip Page", `${featureLabel}...`);

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
        let finalResult = result;
        
        if (titleMatch) {
          title = titleMatch[1];
          finalResult = finalResult.replace(titleMatch[0], "").trim();
        } else {
          const shortPageTitle = content.title.length > 40
            ? content.title.slice(0, 40).trim() + "…"
            : content.title;
          title = `${prefix}${shortPageTitle}`;
        }

        const body = `> Source: [${content.siteName}](${content.url})\n\n${finalResult}`;

        onSaveAsNote(title, body);
        updateAISuccessToast(toastId, "Clip Page", "Page clipped successfully!");
      },
      (msg) => {
        console.error("[WebClipper] Stream failed:", msg);
        if (msg.includes("402") || msg.includes("insufficient") || msg.includes("401")) {
          window.dispatchEvent(new CustomEvent("ai-error"));
        }
        updateAIErrorToast(toastId, "Clip Page", msg.includes("traffic") || msg.includes("limit") ? msg : "Failed to clip page content");
      },
    );
  };

  const handleChatWithPage = async () => {
    if (!content) return;

    const toastId = `spark-ai-toast-${Date.now()}`;
    handleClose(); // Close clipper immediately!

    showAILoaderToast(toastId, "Spark AI", "Preparing page content for Spark AI...");

    const prepared = prepareForAI(content.markdown);
    const success = await openSparkAIWithPageContent(
      prepared,
      content.title,
      content.url,
    );

    if (success) {
      updateAISuccessToast(toastId, "Spark AI", "Sent to Spark AI successfully!");
    } else {
      updateAIErrorToast(toastId, "Spark AI", "Spark AI not found. Opening Chrome Web Store...");
      openUrlViaBackground(ECOSYSTEM.SPARK_AI.storeUrl);
    }
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
            <GlobeIcon size={16} className="w-4 h-4" style={{ color: "hsl(var(--muted-foreground))" }} />
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

      {/* Ready — show preview + actions */}
      {status === "done" && content && (
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
              {onSaveWebClip && (
                <button
                  className="novel-slash-item w-full text-left"
                  onClick={handleSaveHTMLOffline}
                  disabled={htmlStatus === "clipping"}
                >
                  <div className="novel-slash-icon" style={{
                    background: "linear-gradient(135deg, rgba(16, 185, 129, var(--icon-bg-start)) 0%, rgba(16, 185, 129, var(--icon-bg-end)) 100%)",
                    border: "1px solid rgba(16, 185, 129, var(--icon-border))",
                    color: "rgba(16, 185, 129, 1)",
                  }}>
                    <AnimatedIcon animation="hover">
                      <Download className="w-4 h-4" />
                    </AnimatedIcon>
                  </div>
                  <div>
                    <p className="text-[13px] font-medium">
                      {htmlStatus === "clipping" ? "Saving Snapshot..." : "Save HTML Snapshot"}
                    </p>
                    <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                      Preserve full page layout and images in a snapshot
                    </p>
                  </div>
                </button>
              )}

              <button
                className="novel-slash-item w-full text-left"
                onClick={() => handleAction("clean_page")}
              >
                <div className="novel-slash-icon" style={{
                  background: "linear-gradient(135deg, rgba(59, 130, 246, var(--icon-bg-start)) 0%, rgba(59, 130, 246, var(--icon-bg-end)) 100%)",
                  border: "1px solid rgba(59, 130, 246, var(--icon-border))",
                  color: "rgba(59, 130, 246, 1)",
                }}>
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
                <div className="novel-slash-icon" style={{
                  background: "linear-gradient(135deg, rgba(168, 85, 247, var(--icon-bg-start)) 0%, rgba(168, 85, 247, var(--icon-bg-end)) 100%)",
                  border: "1px solid rgba(168, 85, 247, var(--icon-border))",
                  color: "rgba(168, 85, 247, 1)",
                }}>
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
                <div className="novel-slash-icon" style={{
                  background: "linear-gradient(135deg, rgba(236, 72, 153, var(--icon-bg-start)) 0%, rgba(236, 72, 153, var(--icon-bg-end)) 100%)",
                  border: "1px solid rgba(236, 72, 153, var(--icon-border))",
                  color: "rgba(236, 72, 153, 1)",
                }}>
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
                <div className="novel-slash-icon" style={{
                  background: "linear-gradient(135deg, rgba(245, 158, 11, var(--icon-bg-start)) 0%, rgba(245, 158, 11, var(--icon-bg-end)) 100%)",
                  border: "1px solid rgba(245, 158, 11, var(--icon-border))",
                  color: "rgba(245, 158, 11, 1)",
                }}>
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

              <button
                className="novel-slash-item w-full text-left"
                onClick={async () => {
                  const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
                  if (win?.id) {
                    const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
                    if (tab?.id) {
                      chrome.tabs.sendMessage(tab.id, { action: "start-region-capture" });
                    }
                  }
                  onClose();
                }}
              >
                <div className="novel-slash-icon" style={{
                  background: "linear-gradient(135deg, rgba(16, 185, 129, var(--icon-bg-start)) 0%, rgba(16, 185, 129, var(--icon-bg-end)) 100%)",
                  border: "1px solid rgba(16, 185, 129, var(--icon-border))",
                  color: "rgba(16, 185, 129, 1)",
                }}>
                  <AnimatedIcon animation="hover">
                    <CropIcon className="w-4 h-4" />
                  </AnimatedIcon>
                </div>
                <div>
                  <p className="text-[13px] font-medium">Capture Region</p>
                  <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                    Crop screen to note with AI
                  </p>
                </div>
              </button>

              {/* Chat with Page — powered by Spark AI */}
              <button
                className="novel-slash-item w-full text-left"
                onClick={handleChatWithPage}
              >
                <div className="novel-slash-icon" style={{
                  background: "linear-gradient(135deg, rgba(99, 102, 241, var(--icon-bg-start)) 0%, rgba(99, 102, 241, var(--icon-bg-end)) 100%)",
                  border: "1px solid rgba(99, 102, 241, var(--icon-border))",
                }}>
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
