import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { db } from "@/lib/local-db";
import { hasTranscript as hasTranscriptCheck } from "@/lib/media-ai-service";
import { Monitor, AlertCircle, ExternalLink, Loader2, CheckCircle } from "lucide-react";
import fixWebmDurationMod from "webm-duration-fix";

// ─── React Component ──────────────────────────────────────────────

interface VideoNodeViewProps {
  node: {
    attrs: {
      mediaId: string;
      status: "recording" | "saved";
      duration: number;
      fileName: string;
    };
  };
  updateAttributes: (attrs: Record<string, unknown>) => void;
  deleteNode: () => void;
}

function VideoNodeView({ node, deleteNode }: VideoNodeViewProps) {
  const { mediaId, status, duration, fileName } = node.attrs;
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [hasTranscript, setHasTranscript] = useState(false);
  const [bgStatus, setBgStatus] = useState<"idle" | "processing" | "retrying" | "done" | "error">("idle");
  const [bgMessage, setBgMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);

  // Load blob from IndexedDB when status is 'saved'
  useEffect(() => {
    if (status !== "saved" || !mediaId) return;

    let revoked = false;
    db.media_files
      .get(mediaId)
      .then(async (file) => {
        if (revoked) return;
        if (file?.blob) {
          let usableBlob = file.blob;
          try {
            if (usableBlob.type.includes("webm")) {
              const fixWebmDuration = (fixWebmDurationMod as any).default || fixWebmDurationMod;
              usableBlob = await fixWebmDuration(usableBlob);
            }
          } catch (err) {
            console.warn("Failed to fix WebM duration:", err);
          }
          if (revoked) return;
          const url = URL.createObjectURL(usableBlob);
          setVideoUrl(url);
        } else {
          setLoadError(true);
          const noteId = window.location.pathname.split("/").pop();
          db.media_transcripts.get(mediaId).then((transcript) => {
            if (!revoked && transcript) setHasTranscript(true);
          });
          if (noteId) {
            hasTranscriptCheck(mediaId, noteId).then((has) => {
              if (!revoked && has) setHasTranscript(true);
            });
          }
        }
      })
      .catch(() => {
        if (!revoked) {
          setLoadError(true);
          const noteId = window.location.pathname.split("/").pop();
          db.media_transcripts.get(mediaId).then((transcript) => {
            if (!revoked && transcript) setHasTranscript(true);
          });
          if (noteId) {
            hasTranscriptCheck(mediaId, noteId).then((has) => {
              if (!revoked && has) setHasTranscript(true);
            });
          }
        }
      });

    return () => {
      revoked = true;
    };
  }, [mediaId, status]);

  // Listen for background auto-transcription progress
  useEffect(() => {
    if (status !== "saved" || !mediaId) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.mediaId !== mediaId) return;
      if (detail?.step === "done") {
        setHasTranscript(true);
        setBgStatus("done");
        setTimeout(() => setBgStatus("idle"), 3000);
      } else if (detail?.step === "error") {
        setBgStatus("error");
        setErrorMessage(detail?.message);
      } else if (detail?.step === "retrying") {
        setBgStatus("retrying");
        setBgMessage(detail?.message);
      } else {
        setBgStatus("processing");
      }
    };
    window.addEventListener("bg-transcribe-progress", handler);
    return () => window.removeEventListener("bg-transcribe-progress", handler);
  }, [mediaId, status]);

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // ── Recording state ──
  if (status === "recording") {
    return (
      <NodeViewWrapper className="video-node-wrapper" data-type="videoNode">
        <div className="video-node recording">
          <div className="video-node-placeholder">
            <div className="video-node-recording-indicator">
              <span className="video-recording-dot" />
              <span>Screen Recording in progress...</span>
            </div>
          </div>
        </div>
      </NodeViewWrapper>
    );
  }

  // ── Load error state ──
  if (loadError) {
    return (
      <NodeViewWrapper className="video-node-wrapper" data-type="videoNode">
        <div 
          className={`video-node error group relative ${hasTranscript ? "clickable" : ""}`}
          data-drag-handle
          onClick={hasTranscript ? (e) => {
            e.preventDefault();
            const currentNoteId = window.location.pathname.split("/").pop() || "";
            window.dispatchEvent(new CustomEvent("open-media-sheet", {
              detail: {
                type: "video",
                mediaId,
                noteId: currentNoteId,
                fileName,
                duration,
                onDeleteNode: deleteNode,
                missingBlob: true
              }
            }));
          } : undefined}
          style={{ cursor: hasTranscript ? "pointer" : "default" }}
        >
            {!hasTranscript && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteNode();
              }}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 text-white transition-opacity hover:bg-black/70 z-10"
              title="Delete media"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          )}
          <div className="video-node-placeholder error-bg" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <AlertCircle className="w-6 h-6 opacity-40" />
            <span className="video-node-error-text" style={{ fontWeight: 600 }}>
              Media unavailable
            </span>
            <span className="video-node-error-text" style={{ fontSize: "12px", opacity: 0.8 }}>
              This video is stored locally on another device.
            </span>
          </div>
          </div>
      </NodeViewWrapper>
    );
  }

  // ── Saved / Playable state ──
  return (
    <NodeViewWrapper className="video-node-wrapper" data-type="videoNode">
      <div className="video-node saved" data-drag-handle onClick={() => {
          const currentNoteId = window.location.pathname.split("/").pop() || "";
          window.dispatchEvent(new CustomEvent("open-media-sheet", {
            detail: {
              type: "video",
              mediaId,
              noteId: currentNoteId,
              fileName,
              duration,
              onDeleteNode: deleteNode
            }
          }));
        }}>
        {videoUrl ? (
          <div className="video-node-player-wrapper">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              preload="metadata"
              className="video-node-player"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              className="video-node-fullscreen-btn"
              onClick={(e) => {
                e.stopPropagation();
                chrome.runtime.sendMessage({ type: "OPEN_URL", url: chrome.runtime.getURL(`viewer.html?id=${mediaId}`) });
              }}
              title="Open Fullscreen in New Tab"
              type="button"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="video-node-placeholder">
            <Monitor className="w-6 h-6 opacity-30" />
          </div>
        )}
        <div className="video-node-footer">
          <Monitor className="w-3.5 h-3.5 opacity-50" />
          <span className="video-node-label" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {bgStatus === "processing" ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
                <span className="text-primary font-medium animate-pulse">AI Processing...</span>
              </>
            ) : bgStatus === "retrying" ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                <span className="text-amber-500 font-medium">{bgMessage || "Retrying..."}</span>
              </>
            ) : bgStatus === "done" ? (
              <>
                <CheckCircle className="w-3 h-3 text-green-500" />
                <span className="text-green-500 font-medium">Transcript Ready</span>
              </>
            ) : bgStatus === "error" ? (
              <>
                <AlertCircle className="w-3 h-3 text-destructive" />
                <span className="text-destructive font-medium truncate max-w-[150px]">{errorMessage || "Analysis Failed"}</span>
              </>
            ) : (
              fileName || "Screen Recording"
            )}
          </span>
          {duration > 0 && (
            <span className="video-node-duration" style={{ marginLeft: "auto" }}>{formatTime(duration)}</span>
          )}
          
          {hasTranscript && bgStatus === "idle" && (
            <div style={{ marginLeft: "8px", display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{
                background: "hsl(var(--primary)/0.1)",
                color: "hsl(var(--primary))",
                padding: "2px 6px",
                borderRadius: "8px",
                fontSize: "9px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}>
                Transcript Ready
              </span>
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

// ─── Tiptap Node Extension ───────────────────────────────────────

export const VideoNode = Node.create({
  name: "videoNode",
  group: "block",
  atom: true,
  draggable: true,

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        if (editor.isActive(this.name)) return true;
        if (selection.empty && selection.$anchor.nodeBefore?.type.name === this.name) return true;
        return false;
      },
      Delete: ({ editor }) => {
        const { selection } = editor.state;
        if (editor.isActive(this.name)) return true;
        if (selection.empty && selection.$anchor.nodeAfter?.type.name === this.name) return true;
        return false;
      },
    };
  },

  addAttributes() {
    return {
      mediaId: { default: null },
      status: { default: "recording" },
      duration: { default: 0 },
      fileName: { default: "Screen Recording" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="videoNode"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "videoNode",
        style: "display: flex; align-items: center; justify-content: center; background: #f4f4f4; padding: 40px; border-radius: 8px; border: 1px dashed #ccc; color: #666; font-family: sans-serif; font-size: 14px; margin: 10px 0; aspect-ratio: 16/9;"
      }),
      "📺 Video available on original device"
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoNodeView);
  },
});
