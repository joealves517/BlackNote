import { GlobeIcon } from "@/components/icons/globe";
import { CircleHelpIcon } from "@/components/icons/circle-help";
import { FileTextIcon } from "@/components/icons/file-text";
import { SparklesIcon } from "@/components/icons/sparkles";
import { FrameIcon } from "@/components/icons/frame";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import { useState, useEffect } from "react";
import { getAuthToken } from "@/lib/auth-client";
import { AI_API_BASE } from "@/lib/constants";
import { showAILoaderToast, updateAISuccessToast, updateAIErrorToast } from "@/lib/toast";

interface ImageClipperProps {
  dataUrl: string;
  onSaveAsNote: (title: string, markdown: string) => void;
  onClose: () => void;
}

const PROCESSING_LABELS: Record<string, string> = {
  describe_image: "Analyzing image content",
  extract_text: "Extracting text from image",
};

const TITLE_PREFIXES: Record<string, string> = {
  describe_image: "Image Analysis: ",
  extract_text: "Text Extraction: ",
};

export function ImageClipper({ dataUrl, onSaveAsNote, onClose }: ImageClipperProps) {

  const handleInsertIntoNote = () => {
    window.dispatchEvent(new CustomEvent("insert-captured-image", { detail: { dataUrl } }));
    onClose();
  };

  const handleAction = (option: string) => {
    const toastId = `image-clip-toast-${Date.now()}`;
    const featureLabel = PROCESSING_LABELS[option] || "Analyzing image";

    onClose(); // Close the screen capture panel immediately!

    showAILoaderToast(toastId, "Screen Capture", `${featureLabel}...`);

    const payload = JSON.stringify({
      option,
      files: [{ mimeType: "image/png", data: dataUrl.split(",")[1] }]
    });

    const streamImageAI = async () => {
      try {
        const token = await getAuthToken();
        const endpoint = token ? `${AI_API_BASE}/api/ai` : `${AI_API_BASE}/api/ai/free`;

        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: payload,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`AI error (${response.status}): ${errorText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream");

        let result = "";
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          result += decoder.decode(value, { stream: true });
        }

        // Check if the backend streamed an error message instead of real content
        if (result.includes("We are facing high traffic") || result.includes("You have reached your daily limit")) {
          throw new Error(result.trim());
        }

        // Processing done
        const titleMatch = result.match(/^#\s+(.+)$/m);
        const prefix = TITLE_PREFIXES[option] || "";

        let title: string;
        let finalResult = result;
        
        if (titleMatch) {
          title = titleMatch[1];
          finalResult = finalResult.replace(titleMatch[0], "").trim();
        } else {
          title = `${prefix}Screen Capture`;
        }

        onSaveAsNote(title, finalResult);
        updateAISuccessToast(toastId, "Screen Capture", "Image analyzed and saved as note successfully!");

      } catch (err) {
        const msg = err instanceof Error ? err.message : "AI request failed";
        console.error("[ImageClipper] Error:", msg);
        if (msg.includes("402") || msg.includes("insufficient") || msg.includes("401")) {
          window.dispatchEvent(new CustomEvent("ai-error"));
        }
        updateAIErrorToast(toastId, "Screen Capture", msg.includes("traffic") || msg.includes("limit") ? msg : "Failed to analyze image content");
      }
    };

    streamImageAI();
  };

  return (
    <div className="web-clipper">
      {/* Header */}
      <div className="web-clipper-header">
        <div className="web-clipper-header-left">
          <GlobeIcon size={16} className="w-4 h-4" style={{ color: "hsl(var(--muted-foreground))" }} />
          <span className="web-clipper-title">Screen Capture</span>
        </div>
      </div>

      <>
        <div className="web-clipper-preview flex justify-center py-2 bg-muted/20 border-b border-border/40">
          <img src={dataUrl} alt="Captured region" className="max-h-[120px] rounded-sm object-contain" />
        </div>

        <div className="ai-cmd-groups">
          <div className="ai-cmd-group">
            <button
              className="novel-slash-item w-full text-left"
              onClick={() => handleAction("describe_image")}
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
                <p className="text-[13px] font-medium">Explain Image</p>
                <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Get detailed description and insights
                </p>
              </div>
            </button>
            
            <button
              className="novel-slash-item w-full text-left"
              onClick={() => handleAction("extract_text")}
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
                <p className="text-[13px] font-medium">Extract Text</p>
                <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Read text and structure from image
                </p>
              </div>
            </button>

            <button
              className="novel-slash-item w-full text-left"
              onClick={handleInsertIntoNote}
            >
              <div className="novel-slash-icon" style={{
                background: "linear-gradient(135deg, rgba(16, 185, 129, var(--icon-bg-start)) 0%, rgba(16, 185, 129, var(--icon-bg-end)) 100%)",
                border: "1px solid rgba(16, 185, 129, var(--icon-border))",
                color: "rgba(16, 185, 129, 1)",
              }}>
                <AnimatedIcon animation="hover">
                  <FrameIcon className="w-4 h-4" />
                </AnimatedIcon>
              </div>
              <div>
                <p className="text-[13px] font-medium">Insert into Note</p>
                <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Insert captured image into current note
                </p>
              </div>
            </button>
          </div>
        </div>
      </>
    </div>
  );
}
