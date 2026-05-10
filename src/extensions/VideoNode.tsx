import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { db } from "@/lib/local-db";
import { Monitor, AlertCircle, ExternalLink } from "lucide-react";
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
        }
      })
      .catch(() => {
        if (!revoked) setLoadError(true);
      });

    return () => {
      revoked = true;
    };
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
        <div className="video-node error">
          <div className="video-node-placeholder error-bg">
            <AlertCircle className="w-6 h-6 opacity-40" />
            <span className="video-node-error-text">
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
      <div 
        className="video-node saved"
        onClick={() => {
          window.dispatchEvent(new CustomEvent("open-media-sheet", {
            detail: {
              type: "video",
              mediaId,
              fileName,
              duration,
              onDeleteNode: deleteNode
            }
          }));
        }}
      >
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
          <span className="video-node-label">{fileName || "Screen Recording"}</span>
          {duration > 0 && (
            <span className="video-node-duration">{formatTime(duration)}</span>
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
      Backspace: () => this.editor.isActive(this.name),
      Delete: () => this.editor.isActive(this.name),
    }
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
