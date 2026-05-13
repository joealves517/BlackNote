import { GlobeIcon } from "@/components/icons/globe";
import { GripIcon } from "@/components/icons/grip";
import { LoaderCircleIcon } from "@/components/icons/loader-circle";
import { CircleHelpIcon } from "@/components/icons/circle-help";
import { ClipboardCheckIcon } from "@/components/icons/clipboard-check";
import { FileTextIcon } from "@/components/icons/file-text";
import { SparklesIcon } from "@/components/icons/sparkles";
import { BrainIcon } from "@/components/icons/brain";
import { XIcon } from "@/components/icons/x";
import { CircleCheckIcon } from "@/components/icons/circle-check";
import { CropIcon } from "lucide-react";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import { AIProcessingView } from "@/components/ui/ai-processing-view";
import { setWasmUrl } from "@lottiefiles/dotlottie-react";
import { openSparkAIWithPageContent, openUrlViaBackground, ECOSYSTEM } from "@/lib/ecosystem";
import sparkAIIcon from "@/assets/spark-ai-icon.png";

setWasmUrl(chrome.runtime.getURL("dotlottie-player.wasm"));

/**
 * WebClipper — Sidebar component for clipping the current page.
 * ALL actions go through AI → auto-save to a NEW note.
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { useWebClipper } from "@/hooks/use-web-clipper";
import { prepareForAI } from "@/lib/page-reader";
import { getAuthToken } from "@/lib/auth-client";
import { AI_API_BASE } from "@/lib/constants";


interface ImageClipperProps {
  dataUrl: string;
  onSaveAsNote: (title: string, markdown: string) => void;
  onClose: () => void;
}

const PROCESSING_LABELS: Record<string, string> = {
  describe_image: "Analyzing image",
  extract_text: "Extracting text",
};

const TITLE_PREFIXES: Record<string, string> = {
  describe_image: "Image Analysis: ",
  extract_text: "Text Extraction: ",
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
    const token = await getAuthToken();

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

export function ImageClipper({ dataUrl, onSaveAsNote, onClose }: ImageClipperProps) {
  const [processing, setProcessing] = useState<string | null>(null);
  const [processError, setProcessError] = useState("");

  useEffect(() => {
    // Toggle the 'account-sheet' class on the parent sheet to enable the cutout effect for the Lottie robot
    // Also remove overflow-y so the robot isn't clipped by the scroll container
    const sheet = document.querySelector('.clipper-sheet');
    const contentWrapper = document.querySelector('.clipper-sheet-content');
    
    if (processing && processing !== "spark_sent") {
      sheet?.classList.add('account-sheet');
      if (contentWrapper) {
        (contentWrapper as HTMLElement).style.overflow = "visible";
        (contentWrapper as HTMLElement).style.overflowY = "visible";
      }
    } else {
      sheet?.classList.remove('account-sheet');
      if (contentWrapper) {
        (contentWrapper as HTMLElement).style.overflow = "";
        (contentWrapper as HTMLElement).style.overflowY = "";
      }
    }
    
    return () => {
      sheet?.classList.remove('account-sheet');
      if (contentWrapper) {
        (contentWrapper as HTMLElement).style.overflow = "";
        (contentWrapper as HTMLElement).style.overflowY = "";
      }
    };
  }, [processing]);

  const handleAction = (option: string) => {
    setProcessing(option);
    setProcessError("");

    let result = "";

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

        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          result += decoder.decode(value, { stream: true });
        }

        // Check if the backend streamed an error message instead of real content
        if (result.includes("⚠️") || result.includes("We are facing high traffic")) {
          throw new Error(result.replace("⚠️", "").trim());
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

        // The base64 image causes a blank space because TipTap blocks it.
        // We just output the text result.
        const body = finalResult;

        onSaveAsNote(title, body);
        setProcessing(null);
        onClose();

      } catch (err) {
        const msg = err instanceof Error ? err.message : "AI request failed";
        setProcessing(null);
        if (msg.includes("402") || msg.includes("insufficient") || msg.includes("401")) {
          window.dispatchEvent(new CustomEvent("ai-error"));
          onClose();
        } else {
          setProcessError(msg);
        }
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

      {/* AI processing */}
      <AnimatePresence mode="wait">
        {processing ? (
          <AIProcessingView
            key="processing"
            title="Clipping Page"
            messages={
              processing === "spark_sent"
                ? [PROCESSING_LABELS[processing] || "Processing with Spark AI"]
                : ["Analyzing page content", "Extracting main ideas", "Reading text"]
            }
          />
        ) : null}
      </AnimatePresence>

      {/* Process error */}
      {processError && !processing && (
        <div className="web-clipper-error">
          <CircleHelpIcon className="w-4 h-4 shrink-0" />
          <span>{processError}</span>
        </div>
      )}

      {/* Ready — show preview + actions */}
      {!processing && (
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
            </div>
          </div>
        </>
      )}
    </div>
  );
}

