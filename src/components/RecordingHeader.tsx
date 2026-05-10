import { Pause, Play, Square, Trash2, Mic, Monitor } from "lucide-react";
import { useRef, useEffect } from "react";
import type { RecordingState, RecordingMode } from "@/hooks/use-recorder";

interface RecordingHeaderProps {
  state: RecordingState;
  mode: RecordingMode | null;
  elapsed: number;
  analyserNode?: AnalyserNode | null;
  onPause?: () => void;
  onResume?: () => void;
  onStop: () => void;
  onDiscard?: () => void;
}

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function MockWaveform() {
  return (
    <div className="ai-css-waveform">
      <div className="bar bar1"></div>
      <div className="bar bar2"></div>
      <div className="bar bar3"></div>
      <div className="bar bar4"></div>
      <div className="bar bar5"></div>
    </div>
  );
}

// Mini waveform bars inside the island
function MiniWaveform({ analyserNode }: { analyserNode: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!analyserNode || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d")!;
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      analyserNode.getByteFrequencyData(dataArray);

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const barCount = 12;
      const barWidth = 2;
      const gap = (w - barCount * barWidth) / (barCount - 1);
      const step = Math.floor(bufferLength / barCount);

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i * step] / 255;
        const barHeight = Math.max(2, value * h);
        const x = i * (barWidth + gap);
        const y = (h - barHeight) / 2;

        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 1);
        ctx.fill();
      }
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [analyserNode]);

  return (
    <canvas
      ref={canvasRef}
      width={48}
      height={18}
      className="recording-mini-waveform"
    />
  );
}

export function RecordingHeader({
  state,
  mode,
  elapsed,
  analyserNode,
  onPause,
  onResume,
  onStop,
  onDiscard,
}: RecordingHeaderProps) {
  const isPaused = state === "paused";
  const isSaving = state === "saving";
  const isRequesting = state === "requesting";
  const isRecording = state === "recording";

  return (
    <div className="recording-header-container">
      {/* Main Island Pill */}
      <div className="recording-island">
        {/* Left: dot + icon + timer */}
        <div className="recording-island-left">
          {isRecording ? (
            <div className="recording-dot" />
          ) : isPaused ? (
            <div className="recording-dot paused" />
          ) : (
            <div className="recording-dot processing" />
          )}
          {mode === "camera" || mode === "screen" ? (
            <Monitor className="w-3.5 h-3.5 opacity-80" />
          ) : analyserNode ? (
            <Mic className="w-3.5 h-3.5 opacity-80" />
          ) : (
            <MockWaveform />
          )}
          <span className="recording-timer">{formatTimer(elapsed)}</span>
        </div>

        {/* Center: mini waveform */}
        {analyserNode && !isPaused && !isSaving && !isRequesting && (
          <MiniWaveform analyserNode={analyserNode} />
        )}

        {/* Right: controls */}
        <div className="recording-island-controls">
          {isRequesting ? (
            <span className="recording-saving-text">Preparing...</span>
          ) : isSaving ? (
            <span className="recording-saving-text">Saving...</span>
          ) : (
            <>
              {/* Pause / Resume */}
              {(onPause || onResume) && (
                <button
                  className="recording-ctrl-btn"
                  onClick={isPaused ? onResume : onPause}
                  title={isPaused ? "Resume" : "Pause"}
                  type="button"
                >
                  {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                </button>
              )}

              {/* Discard */}
              {onDiscard && (
                <button
                  className="recording-ctrl-btn discard"
                  onClick={onDiscard}
                  title="Discard"
                  type="button"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Separate Stop Circle — iPhone style */}
      {!isRequesting && !isSaving && (
        <button
          className="recording-stop-circle"
          onClick={onStop}
          title="Stop Recording"
          type="button"
        >
          <Square className="w-3.5 h-3.5" fill="currentColor" />
        </button>
      )}
    </div>
  );
}
