import { useState, useCallback, useEffect, useRef } from "react";
import { db } from "@/lib/local-db";
import type { RecorderResult } from "./use-recorder-types";
import fixWebmDurationMod from "webm-duration-fix";

// ─── Types ────────────────────────────────────────────────────────

export type RecordingMode = "audio" | "screen";
export type RecordingState = "idle" | "requesting" | "recording" | "paused" | "saving";

export interface UseRecorderReturn {
  state: RecordingState;
  mode: RecordingMode | null;
  elapsed: number;
  analyserNode: AnalyserNode | null;
  startAudioRecording: (skipMic?: boolean) => Promise<boolean>;
  startScreenRecording: () => Promise<boolean>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => Promise<RecorderResult | null>;
  discardRecording: () => void;
  error: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────

function generateId(): string {
  return `media_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function selectAudioMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || "audio/webm";
}

function selectVideoMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";
}

// ─── Hook ─────────────────────────────────────────────────────────

export function useRecorder(): UseRecorderReturn {
  const [state, setState] = useState<RecordingState>("idle");
  const [mode, setMode] = useState<RecordingMode | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  // Local refs for audio recording (runs in side panel, NOT offscreen)
  const localRecorder = useRef<MediaRecorder | null>(null);
  const localStreams = useRef<MediaStream[]>([]);
  const localChunks = useRef<Blob[]>([]);
  const localAudioCtx = useRef<AudioContext | null>(null);
  const localMediaId = useRef("");
  const localTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const localStartTime = useRef(0);
  const localPausedElapsed = useRef(0);
  const isLocalRecording = useRef(false);
  const elapsedRef = useRef(0);

  // Keep ref in sync with state
  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

  // Expose analyserNode globally for Tiptap AudioNode waveform (no prop drilling through Tiptap)
  useEffect(() => {
    (window as any).__blacknote_analyser = analyserNode;
    return () => { (window as any).__blacknote_analyser = null; };
  }, [analyserNode]);

  // ── Storage sync (for offscreen-based screen recording) ──
  useEffect(() => {
    chrome.storage.local.get("blacknote_recording", (res) => {
      if (res.blacknote_recording && !isLocalRecording.current) {
        setState(res.blacknote_recording.state || "idle");
        setMode(res.blacknote_recording.mode || null);
        setElapsed(res.blacknote_recording.elapsed || 0);
      }
    });

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.blacknote_recording && !isLocalRecording.current) {
        const newVal = changes.blacknote_recording.newValue;
        if (newVal) {
          setState(newVal.state || "idle");
          setMode(newVal.mode || null);
          setElapsed(newVal.elapsed || 0);
        } else {
          setState("idle");
          setMode(null);
          setElapsed(0);
        }
      }

      const cmd = changes.blacknote_recording_command?.newValue;
      if (cmd) {
        if (cmd.action === "RECORDING_STOP") {
          window.dispatchEvent(new CustomEvent("toolbar-stop-recording"));
        } else if (cmd.action === "RECORDING_DISCARD") {
          window.dispatchEvent(new CustomEvent("toolbar-discard-recording"));
        }
        chrome.storage.local.remove("blacknote_recording_command");
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  // Auto-save recording when panel closes (recording runs in-process)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!isLocalRecording.current || !localRecorder.current) return;

      // Synchronously stop recorder and save whatever we have
      const rec = localRecorder.current;
      if (rec.state !== "inactive") {
        rec.stop();
      }

      // Save collected chunks synchronously via Blob
      if (localChunks.current.length > 0) {
        const isAudio = mode === "audio";
        const blob = new Blob(localChunks.current, { type: rec.mimeType || (isAudio ? "audio/webm" : "video/webm") });
        const id = localMediaId.current;
        const duration = elapsedRef.current;

        // Fire-and-forget save — panel is closing but IndexedDB ops are async
        db.media_files.put({
          id,
          noteId: "",
          type: isAudio ? "audio" : "video",
          blob,
          duration,
          createdAt: Date.now(),
          fileName: isAudio
            ? `Meeting Audio ${new Date().toLocaleDateString()}`
            : `Screen Recording ${new Date().toLocaleDateString()}`,
        }).catch(() => {});
      }

      // Clean storage state
      chrome.storage.local.set({ blacknote_recording: { state: "idle", mode: null, elapsed: 0 } });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [mode]);

  useEffect(() => {
    const handleMsg = (msg: any) => {
      if (msg.type === "DO_RELOAD_SIDEPANEL") {
        window.location.reload();
      }
    };
    chrome.runtime.onMessage.addListener(handleMsg);
    return () => chrome.runtime.onMessage.removeListener(handleMsg);
  }, []);

  // ── Local helpers ──

  const writeStorage = useCallback((s: RecordingState, e?: number) => {
    chrome.storage.local.set({
      blacknote_recording: {
        state: s,
        mode: "audio",
        elapsed: e ?? elapsedRef.current,
        mediaId: localMediaId.current,
        _panelVisible: !document.hidden,
      },
    });
  }, []);

  const startLocalTimer = useCallback(() => {
    if (localTimer.current) clearInterval(localTimer.current);
    localStartTime.current = Date.now();
    localTimer.current = setInterval(() => {
      const total = localPausedElapsed.current + (Date.now() - localStartTime.current);
      const sec = Math.floor(total / 1000);
      setElapsed(sec);
      writeStorage("recording", sec);
    }, 500);
  }, [writeStorage]);

  const cleanupLocal = useCallback(() => {
    if (localTimer.current) {
      clearInterval(localTimer.current);
      localTimer.current = null;
    }
    localStreams.current.forEach(s => s.getTracks().forEach(t => t.stop()));
    localStreams.current = [];
    localRecorder.current = null;
    localChunks.current = [];
    if (localAudioCtx.current) {
      localAudioCtx.current.close().catch(() => {});
      localAudioCtx.current = null;
    }
    isLocalRecording.current = false;
    setAnalyserNode(null);
  }, []);

  // ── Actions ───────────────────────────────────────────────────────

  const startAudioRecording = useCallback(async (skipMic = false): Promise<boolean> => {
    try {
      setError(null);
      setState("requesting");
      setMode("audio");
      isLocalRecording.current = true;
      localMediaId.current = generateId();
      localChunks.current = [];
      localPausedElapsed.current = 0;

      // Step 1: Get mic (skip if user chose to continue without mic)
      let micStream: MediaStream | null = null;
      if (!skipMic) {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        localStreams.current.push(micStream);
      }

      let finalStream: MediaStream | null = micStream;

      // Step 2: Try to capture tab/system audio via desktopCapture
      if (chrome.desktopCapture) {
        try {
          const desktopStreamId = await new Promise<string | null>((resolve) => {
            chrome.desktopCapture.chooseDesktopMedia(["tab", "audio"], (streamId: string) => {
              if (!streamId || chrome.runtime.lastError) resolve(null);
              else resolve(streamId);
            });
          });

          if (desktopStreamId) {
            const desktopStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: desktopStreamId }
              } as any,
              video: {
                mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: desktopStreamId }
              } as any,
            });

            // Drop video tracks
            desktopStream.getVideoTracks().forEach(t => { t.stop(); desktopStream.removeTrack(t); });
            localStreams.current.push(desktopStream);

            if (desktopStream.getAudioTracks().length > 0) {
              const ctx = new AudioContext();
              if (ctx.state === "suspended") await ctx.resume();
              localAudioCtx.current = ctx;
              const destination = ctx.createMediaStreamDestination();

              // Create analyser for waveform visualization
              const analyser = ctx.createAnalyser();
              analyser.fftSize = 256;

              const desktopSrc = ctx.createMediaStreamSource(desktopStream);
              desktopSrc.connect(destination);
              desktopSrc.connect(analyser);

              if (micStream) {
                const micSrc = ctx.createMediaStreamSource(micStream);
                micSrc.connect(destination);
                micSrc.connect(analyser);
              }

              setAnalyserNode(analyser);
              finalStream = destination.stream;
            }
          }
        } catch (err) {
          console.warn("[useRecorder] Tab audio capture failed, mic-only:", err);
        }
      }

      if (!finalStream || finalStream.getAudioTracks().length === 0) {
        throw new Error("No audio sources available");
      }

      // If no AudioContext was created (mic-only), create analyser from mic stream
      if (!analyserNode && finalStream.getAudioTracks().length > 0) {
        const ctx = new AudioContext();
        if (ctx.state === "suspended") await ctx.resume();
        localAudioCtx.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        const src = ctx.createMediaStreamSource(finalStream);
        src.connect(analyser);
        setAnalyserNode(analyser);
      }

      // Step 3: Start MediaRecorder locally
      const mimeType = selectAudioMimeType();
      const rec = new MediaRecorder(finalStream, { mimeType });
      localRecorder.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) localChunks.current.push(e.data);
      };

      rec.start(1000);
      setState("recording");
      setElapsed(0);
      startLocalTimer();
      writeStorage("recording", 0);
      return true;
    } catch (err: any) {
      // Cleanup internal state but RE-THROW for App.tsx to handle UI
      cleanupLocal();
      setState("idle");
      setMode(null);
      writeStorage("idle", 0);
      throw err;
    }
  }, [startLocalTimer, writeStorage, cleanupLocal]);

  const startScreenRecording = useCallback(async (): Promise<boolean> => {
    try {
      setError(null);
      setState("requesting");
      setMode("screen");
      isLocalRecording.current = true;
      localMediaId.current = generateId();
      localChunks.current = [];
      localPausedElapsed.current = 0;

      if (!chrome.desktopCapture) {
        setError("Desktop capture not supported.");
        setState("idle");
        setMode(null);
        return false;
      }

      // Show screen/tab picker
      const desktopStreamId = await new Promise<string | null>((resolve) => {
        chrome.desktopCapture.chooseDesktopMedia(["screen", "window", "tab", "audio"], (streamId: string) => {
          if (!streamId || chrome.runtime.lastError) resolve(null);
          else resolve(streamId);
        });
      });

      if (!desktopStreamId) {
        setState("idle");
        setMode(null);
        return false;
      }

      // Capture screen + audio from the selected source
      const displayStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: desktopStreamId }
        } as any,
        video: {
          mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: desktopStreamId }
        } as any,
      });
      localStreams.current.push(displayStream);

      let finalStream = displayStream;

      // Try to add mic audio mixed in
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: true, // Simplified to prevent OverconstrainedError
          video: false,
        });
        localStreams.current.push(micStream);

        const ctx = new AudioContext();
        if (ctx.state === "suspended") await ctx.resume();
        localAudioCtx.current = ctx;
        const destination = ctx.createMediaStreamDestination();

        // Create analyser for waveform
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;

        // Mix display audio
        const displayAudioTracks = displayStream.getAudioTracks();
        if (displayAudioTracks.length > 0) {
          const displayAudioStream = new MediaStream(displayAudioTracks);
          const displaySource = ctx.createMediaStreamSource(displayAudioStream);
          displaySource.connect(destination);
          displaySource.connect(analyser);
        }

        // Mix mic audio
        const micSource = ctx.createMediaStreamSource(micStream);
        micSource.connect(destination);
        micSource.connect(analyser);

        setAnalyserNode(analyser);

        // Combine: video from display + mixed audio
        const videoTrack = displayStream.getVideoTracks()[0];
        const mixedAudio = destination.stream.getAudioTracks();
        finalStream = new MediaStream([videoTrack, ...mixedAudio]);
      } catch (err: any) {
        // Mic is optional for screen recording — just log and continue with display audio only
        console.warn(`[useRecorder] Mic unavailable for screen recording (continuing without mic): ${err?.name} - ${err?.message}`);
      }

      const mimeType = selectVideoMimeType();
      const rec = new MediaRecorder(finalStream, { mimeType });
      localRecorder.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) localChunks.current.push(e.data);
      };

      // Auto-stop when screen share ends
      displayStream.getVideoTracks().forEach(track => {
        track.onended = () => {
          if (localRecorder.current?.state !== "inactive") {
            window.dispatchEvent(new CustomEvent("toolbar-stop-recording"));
          }
        };
      });

      rec.start(1000);
      setState("recording");
      setElapsed(0);
      startLocalTimer();
      writeStorage("recording", 0);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      cleanupLocal();
      setState("idle");
      setMode(null);
      writeStorage("idle", 0);
      return false;
    }
  }, [startLocalTimer, writeStorage, cleanupLocal]);

  const pauseRecording = useCallback(() => {
    if (isLocalRecording.current && localRecorder.current?.state === "recording") {
      localRecorder.current.pause();
      if (localTimer.current) clearInterval(localTimer.current);
      localPausedElapsed.current += Date.now() - localStartTime.current;
      setState("paused");
      writeStorage("paused");
    } else {
      chrome.runtime.sendMessage({ type: "RECORDING_PAUSE" });
    }
  }, [writeStorage]);

  const resumeRecording = useCallback(() => {
    if (isLocalRecording.current && localRecorder.current?.state === "paused") {
      localRecorder.current.resume();
      startLocalTimer();
      setState("recording");
      writeStorage("recording");
    } else {
      chrome.runtime.sendMessage({ type: "RECORDING_RESUME" });
    }
  }, [startLocalTimer, writeStorage]);

  const stopRecording = useCallback(async (): Promise<RecorderResult | null> => {
    if (isLocalRecording.current && localRecorder.current) {
      setState("saving");
      writeStorage("saving");

      const currentMode = mode;
      const isAudio = currentMode === "audio";

      return new Promise((resolve) => {
        const rec = localRecorder.current!;
        rec.onstop = async () => {
          const rawBlob = new Blob(localChunks.current, { type: rec.mimeType || (isAudio ? "audio/webm" : "video/webm") });
          const id = localMediaId.current;
          const duration = elapsedRef.current;
          const mediaType = isAudio ? "audio" : "video";

          try {
            // Fix duration for webm files generated by MediaRecorder
            const fixWebmDuration = (fixWebmDurationMod as any).default || fixWebmDurationMod;
            const blob = await fixWebmDuration(rawBlob);

            await db.media_files.put({
              id,
              noteId: "",
              type: mediaType,
              blob,
              duration,
              createdAt: Date.now(),
              fileName: isAudio
                ? `Audio ${new Date().toLocaleDateString()}`
                : `Screen Recording ${new Date().toLocaleDateString()}`,
            });
          } catch (err) {
            console.error("[useRecorder] Failed to save media:", err);
          }

          cleanupLocal();
          setState("idle");
          setMode(null);
          setElapsed(0);
          writeStorage("idle", 0);
          resolve({ mediaId: id, duration, type: mediaType });
        };
        rec.stop();
      });
    }

    // Fallback for any non-local recording
    setState("saving");
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "RECORDING_STOP" }, (res) => {
        if (chrome.runtime.lastError) {
          console.warn("[useRecorder] Connection failed on stop:", chrome.runtime.lastError);
          // Force clear stuck state
          setState("idle");
          setMode(null);
          setElapsed(0);
          writeStorage("idle", 0);
          resolve(null);
          return;
        }
        if (res?.success && res.result) resolve(res.result);
        else {
          setState("idle");
          setMode(null);
          setElapsed(0);
          writeStorage("idle", 0);
          resolve(null);
        }
      });
    });
  }, [mode, cleanupLocal, writeStorage]);

  const discardRecording = useCallback(() => {
    if (isLocalRecording.current) {
      if (localRecorder.current && localRecorder.current.state !== "inactive") {
        localRecorder.current.stop();
      }
      cleanupLocal();
      setState("idle");
      setMode(null);
      setElapsed(0);
      writeStorage("idle", 0);
    } else {
      chrome.runtime.sendMessage({ type: "RECORDING_DISCARD" }, () => {
        if (chrome.runtime.lastError) {
          console.warn("[useRecorder] Connection failed on discard:", chrome.runtime.lastError);
        }
        // Force clear state regardless of success
        setState("idle");
        setMode(null);
        setElapsed(0);
        writeStorage("idle", 0);
      });
    }
  }, [cleanupLocal, writeStorage]);

  return {
    state,
    mode,
    elapsed,
    analyserNode,
    startAudioRecording,
    startScreenRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    discardRecording,
    error,
  };
}
