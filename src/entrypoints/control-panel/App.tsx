import { useEffect, useState } from "react";
import { Mic, Monitor, Pause, Play, Square, Trash2 } from "lucide-react";

export default function App() {
  const [state, setState] = useState("idle");
  const [mode, setMode] = useState<"audio" | "screen" | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    chrome.storage.local.get("blacknote_recording", (res) => {
      if (res.blacknote_recording) {
        setState(res.blacknote_recording.state || "idle");
        setMode(res.blacknote_recording.mode || null);
        setElapsed(res.blacknote_recording.elapsed || 0);
      }
    });

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.blacknote_recording?.newValue) {
        const newVal = changes.blacknote_recording.newValue;
        setState(newVal.state || "idle");
        setMode(newVal.mode || null);
        setElapsed(newVal.elapsed || 0);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const sendCommand = (type: string) => {
    chrome.runtime.sendMessage({ type });
  };

  if (state === "idle" || state === "saving") {
    return <div className="flex h-screen w-screen items-center justify-center bg-zinc-900 text-white text-sm">Finishing...</div>;
  }

  return (
    <div className="flex h-screen w-screen items-center justify-between bg-[#1a1a1a] px-4 py-2 text-white overflow-hidden shadow-2xl">
      <div className="flex items-center gap-3">
        <div className={`h-2.5 w-2.5 rounded-full ${state === 'paused' ? 'bg-amber-400' : 'bg-red-500 animate-[pulse_2s_ease-in-out_infinite]'}`} />
        {mode === "audio" ? <Mic size={16} className="text-zinc-400" /> : <Monitor size={16} className="text-zinc-400" />}
        <span className="font-mono text-sm font-medium tracking-wider">{formatTime(elapsed)}</span>
      </div>
      
      <div className="h-5 w-px bg-zinc-700/50 mx-2" />
      
      <div className="flex items-center gap-2">
        {state === "paused" ? (
          <button onClick={() => sendCommand("UI_REQUEST_RESUME")} className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors" title="Resume">
            <Play size={16} fill="currentColor" className="ml-0.5" />
          </button>
        ) : (
          <button onClick={() => sendCommand("UI_REQUEST_PAUSE")} className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors" title="Pause">
            <Pause size={16} fill="currentColor" />
          </button>
        )}
        
        <button onClick={() => sendCommand("UI_REQUEST_STOP")} className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors" title="Stop">
          <Square size={14} fill="currentColor" />
        </button>
        
        <button onClick={() => sendCommand("UI_REQUEST_DISCARD")} className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition-colors ml-1" title="Discard">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
