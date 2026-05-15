import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { db } from "@/lib/local-db";
import { hasTranscript as hasTranscriptCheck } from "@/lib/media-ai-service";
import { Mic, Play, Pause, AlertCircle, Loader2, CheckCircle } from "lucide-react";
import WaveSurfer from "wavesurfer.js";

// ─── Live Waveform Component ──────────────────────────────────────

function LiveWaveform() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d")!;

    // Resize canvas to fill container
    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * 2; // 2x for retina
      canvas.height = rect.height * 2;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);

      const analyser = (window as any).__blacknote_analyser as AnalyserNode | undefined;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (!analyser) {
        // Fallback: draw idle bars
        drawIdleBars(ctx, w, h);
        return;
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      const barCount = Math.floor(w / 6); // bar + gap = ~6px at 2x
      const barWidth = 3; // at 2x
      const gap = (w - barCount * barWidth) / Math.max(barCount - 1, 1);
      const step = Math.max(1, Math.floor(bufferLength / barCount));

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[Math.min(i * step, bufferLength - 1)] / 255;
        const barHeight = Math.max(3, value * h * 0.85);
        const x = i * (barWidth + gap);
        const y = (h - barHeight) / 2;

        // Gradient red to amber
        const intensity = value;
        const r = Math.round(239 + (251 - 239) * intensity);
        const g = Math.round(68 + (191 - 68) * intensity);
        const b = Math.round(68 + (36 - 68) * intensity);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.5 + intensity * 0.5})`;

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 1.5);
        ctx.fill();
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="audio-node-live-waveform">
      <canvas ref={canvasRef} />
    </div>
  );
}

function drawIdleBars(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const barCount = Math.floor(w / 6);
  const barWidth = 3;
  const gap = (w - barCount * barWidth) / Math.max(barCount - 1, 1);
  const time = Date.now() / 1000;

  for (let i = 0; i < barCount; i++) {
    const wave = Math.sin(time * 2 + i * 0.3) * 0.3 + 0.3;
    const barHeight = Math.max(3, wave * h * 0.5);
    const x = i * (barWidth + gap);
    const y = (h - barHeight) / 2;

    ctx.fillStyle = `rgba(239, 68, 68, ${0.3 + wave * 0.3})`;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, 1.5);
    ctx.fill();
  }
}

// ─── React Component ──────────────────────────────────────────────

interface AudioNodeViewProps {
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

function AudioNodeView({ node, deleteNode }: AudioNodeViewProps) {
  const { mediaId, status, duration, fileName } = node.attrs;
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [hasTranscript, setHasTranscript] = useState(false);
  const [bgStatus, setBgStatus] = useState<"idle" | "processing" | "retrying" | "done" | "error">("idle");
  const [bgMessage, setBgMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);

  // Load blob from IndexedDB when status is 'saved'
  useEffect(() => {
    if (status !== "saved" || !mediaId) return;

    let revoked = false;

    if (mediaId === "welcome-audio") {
      const url = chrome.runtime.getURL("welcome-blacknote.mp3");
      setAudioUrl(url);
      setHasTranscript(true); // Welcome note always has transcript
      return;
    }

    db.media_files
      .get(mediaId)
      .then((file) => {
        if (revoked) return;
        if (file?.blob) {
          const url = URL.createObjectURL(file.blob);
          setAudioUrl(url);
        } else {
          setLoadError(true);
          // Check if transcript exists to allow AI features even if file is gone
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
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Initialize wavesurfer when audioUrl is ready
  useEffect(() => {
    if (!audioUrl || !waveformRef.current) return;

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: 'rgba(59, 130, 246, 0.3)',
      progressColor: '#3b82f6',
      cursorColor: '#3b82f6',
      cursorWidth: 2,
      barWidth: 2.5,
      barGap: 2,
      barRadius: 2,
      height: 24,
      url: audioUrl,
      normalize: true,
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('timeupdate', (time) => setCurrentTime(time));
    ws.on('finish', () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });

    wavesurferRef.current = ws;

    return () => {
      ws.destroy();
    };
  }, [audioUrl]);

  const togglePlayback = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // ── Recording state ──
  if (status === "recording") {
    return (
      <NodeViewWrapper className="audio-node-wrapper" data-type="audioNode">
        <div className="audio-node recording">
          <div className="audio-node-icon recording-pulse">
            <Mic className="w-4 h-4" />
          </div>
          <div className="audio-node-info">
            <span className="audio-node-title">Recording...</span>
            <LiveWaveform />
          </div>
        </div>
      </NodeViewWrapper>
    );
  }

  // ── Load error state ──
  if (loadError) {
    return (
      <NodeViewWrapper className="audio-node-wrapper" data-type="audioNode">
        <div 
          className={`audio-node error group relative ${hasTranscript ? "clickable" : ""}`}
          data-drag-handle
          onClick={hasTranscript ? (e) => {
            e.preventDefault();
            const currentNoteId = window.location.pathname.split("/").pop() || "";
            window.dispatchEvent(new CustomEvent("open-media-sheet", {
              detail: {
                type: "audio",
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
              className="absolute top-1/2 -translate-y-1/2 right-4 p-1.5 rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 text-foreground transition-opacity z-10"
              title="Delete media"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          )}
          <div className="audio-node-icon error-icon">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div className="audio-node-info" style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span className="audio-node-title">Media unavailable</span>
              <span className="audio-node-subtitle" style={{ fontSize: "11px", opacity: 0.8 }}>
                This audio is stored locally on another device.
              </span>
            </div>
          </div>
        </div>
      </NodeViewWrapper>
    );
  }

  // ── Saved / Playable state ──
  const actualDuration = (wavesurferRef.current && wavesurferRef.current.getDuration() > 0) 
    ? wavesurferRef.current.getDuration() 
    : duration;

  return (
    <NodeViewWrapper className="audio-node-wrapper" data-type="audioNode">
      <div 
        className="audio-node saved"
        data-drag-handle
        onClick={() => {
          const currentNoteId = window.location.pathname.split("/").pop() || "";
          window.dispatchEvent(new CustomEvent("open-media-sheet", {
            detail: {
              type: "audio",
              mediaId,
              noteId: currentNoteId,
              fileName,
              duration,
              onDeleteNode: deleteNode
            }
          }));
        }}
      >
        <button
          className="audio-node-play-btn"
          onClick={(e) => {
            e.stopPropagation();
            togglePlayback();
          }}
          type="button"
        >
          {isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" style={{ marginLeft: "1px" }} />
          )}
        </button>

        <div className="audio-node-body">
          <div className="audio-node-meta">
            <span className="audio-node-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
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
                fileName || "Audio Recording"
              )}
            </span>
            <span className="audio-node-duration">
              {formatTime(isPlaying ? currentTime : duration)}
            </span>
          </div>
          <div className="audio-node-waveform-container" onClick={(e) => e.stopPropagation()}>
            <div ref={waveformRef} className="w-full" style={{ height: "24px" }} />
          </div>
          
          {hasTranscript && bgStatus === "idle" && (
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "2px" }}>
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

export const AudioNode = Node.create({
  name: "audioNode",
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
      fileName: { default: "Audio Recording" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="audioNode"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "audioNode",
        style: "display: flex; align-items: center; justify-content: center; background: #f4f4f4; padding: 20px; border-radius: 8px; border: 1px dashed #ccc; color: #666; font-family: sans-serif; font-size: 14px; margin: 10px 0;"
      }),
      "🎵 Audio available on original device"
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AudioNodeView);
  },
});
