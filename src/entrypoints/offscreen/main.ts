import { db } from "@/lib/local-db";

// ─── Constants & Types ─────────────────────────────────────────────

type RecordingMode = "audio" | "screen";
type RecordingState = "idle" | "requesting" | "recording" | "paused" | "saving";

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let streams: MediaStream[] = [];
let audioCtx: AudioContext | null = null;

let state: RecordingState = "idle";
let mode: RecordingMode | null = null;
let mediaId = "";
let elapsed = 0;
let pausedElapsed = 0;
let startTime = 0;
let timer: ReturnType<typeof setInterval> | null = null;

// ─── Helpers ───────────────────────────────────────────────────────

function generateId(): string {
  return `media_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function selectMimeType(isAudioOnly: boolean): string {
  if (isAudioOnly) {
    const audioCandidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
    ];
    return audioCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || "audio/webm";
  }
  const videoCandidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return videoCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";
}

function updateStorage(newState?: RecordingState) {
  if (newState) state = newState;
  chrome.runtime.sendMessage({
    type: "OFFSCREEN_STATE_UPDATE",
    payload: {
      state,
      mode,
      elapsed,
      mediaId,
    },
  });
}

function startTimer() {
  if (timer) clearInterval(timer);
  startTime = Date.now();

  timer = setInterval(() => {
    const now = Date.now();
    const total = pausedElapsed + (now - startTime);
    const sec = Math.floor(total / 1000);
    elapsed = sec;
    updateStorage();
  }, 500);
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function cleanup() {
  stopTimer();
  streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
  streams = [];
  recorder = null;
  chunks = [];
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
}

// ─── Actions ───────────────────────────────────────────────────────

async function handleStartAudio(streamId?: string) {
  console.log("[Offscreen] ▶ handleStartAudio called, streamId:", streamId ? "present" : "undefined");
  try {
    state = "requesting";
    mode = "audio";
    elapsed = 0;
    pausedElapsed = 0;
    mediaId = generateId();
    updateStorage();

    let streamsAdded = false;
    let micStream: MediaStream | null = null;
    
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      streams.push(micStream);
      streamsAdded = true;
      console.log("[Offscreen] ✅ Mic obtained");
    } catch (err) {
      console.warn("[Offscreen] ❌ Mic unavailable:", err);
    }

    let finalStream: MediaStream | null = micStream;

    // If streamId from desktopCapture is provided, capture tab/desktop audio
    if (streamId) {
      try {
        console.log("[Offscreen] Capturing desktop audio with streamId...");
        const desktopStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: streamId,
            }
          } as any,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: streamId,
            }
          } as any,
        });

        // Drop video tracks — we only need audio
        desktopStream.getVideoTracks().forEach(track => {
          track.stop();
          desktopStream.removeTrack(track);
        });

        const audioTracks = desktopStream.getAudioTracks();
        console.log("[Offscreen] ✅ Desktop audio tracks:", audioTracks.length);

        if (audioTracks.length > 0) {
          const ctx = new AudioContext();
          if (ctx.state === "suspended") await ctx.resume();
          audioCtx = ctx;
          const destination = ctx.createMediaStreamDestination();

          // Mix desktop audio
          const desktopSource = ctx.createMediaStreamSource(desktopStream);
          desktopSource.connect(destination);
          desktopSource.connect(ctx.destination); // Play back to user

          // Mix mic if available
          if (micStream) {
            const micSource = ctx.createMediaStreamSource(micStream);
            micSource.connect(destination);
          }

          finalStream = destination.stream;
          streams.push(desktopStream);
          streamsAdded = true;
        }
      } catch (err: any) {
        console.error("[Offscreen] ❌ Desktop audio capture failed:", err?.name, err?.message, err);
      }
    } else {
      console.log("[Offscreen] No streamId, mic-only mode");
    }

    if (!streamsAdded || !finalStream) {
      throw new Error("No audio sources available");
    }

    const mimeType = selectMimeType(true);
    recorder = new MediaRecorder(finalStream, { mimeType });
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    // Auto-stop if all tracks end
    finalStream.getTracks().forEach((track) => {
      track.onended = () => {
        if (state === "recording" || state === "paused") {
          chrome.runtime.sendMessage({ type: "OFFSCREEN_TRIGGER_STOP" });
        }
      };
    });

    recorder.start(1000);
    startTimer();
    updateStorage("recording");
    return true;
  } catch (err) {
    const errorName = err instanceof DOMException ? err.name : (err instanceof Error ? err.name : 'UnknownError');
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[Offscreen] startAudio failed: ${errorName} - ${errorMessage}`, err);
    cleanup();
    state = "idle";
    mode = null;
    updateStorage();
    return false;
  }
}

async function handleStartScreen(streamId: string) {
  try {
    state = "requesting";
    mode = "screen";
    elapsed = 0;
    pausedElapsed = 0;
    mediaId = generateId();
    updateStorage();

    // Use streamId from desktopCapture API
    const displayStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId,
        }
      } as any,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId,
        }
      } as any,
    });
    streams.push(displayStream);

    let finalStream = displayStream;

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      streams.push(micStream);

      const ctx = new AudioContext();
      if (ctx.state === "suspended") {
        await ctx.resume().catch(e => console.warn("[Offscreen] Failed to resume AudioContext:", e));
      }
      audioCtx = ctx;
      const destination = ctx.createMediaStreamDestination();

      const displayAudioTracks = displayStream.getAudioTracks();
      if (displayAudioTracks.length > 0) {
        const displayAudioStream = new MediaStream(displayAudioTracks);
        const displaySource = ctx.createMediaStreamSource(displayAudioStream);
        displaySource.connect(destination);
      }

      const micSource = ctx.createMediaStreamSource(micStream);
      micSource.connect(destination);

      finalStream = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);
    } catch {
      console.warn("[Offscreen] Mic unavailable for screen recording");
    }

    const mimeType = selectMimeType(false);
    recorder = new MediaRecorder(finalStream, { mimeType, videoBitsPerSecond: 3000000 });
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    displayStream.getVideoTracks().forEach((track) => {
      track.onended = () => {
        if (state === "recording" || state === "paused") {
          chrome.runtime.sendMessage({ type: "OFFSCREEN_TRIGGER_STOP" });
        }
      };
    });

    recorder.start(1000);
    startTimer();
    updateStorage("recording");
    return true;
  } catch (err) {
    console.error("[Offscreen] startScreen failed:", err);
    cleanup();
    state = "idle";
    mode = null;
    updateStorage();
    return false;
  }
}

function handlePause() {
  if (recorder && recorder.state === "recording") {
    recorder.pause();
    stopTimer();
    pausedElapsed += Date.now() - startTime;
    updateStorage("paused");
  }
}

function handleResume() {
  if (recorder && recorder.state === "paused") {
    recorder.resume();
    startTimer();
    updateStorage("recording");
  }
}

function handleStop(): Promise<{ mediaId: string; duration: number; type: "audio" | "video" } | null> {
  return new Promise((resolve) => {
    if (!recorder || recorder.state === "inactive") {
      cleanup();
      state = "idle";
      mode = null;
      updateStorage();
      resolve(null);
      return;
    }

    updateStorage("saving");
    stopTimer();

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
      const isAudio = mode === "audio";
      const id = mediaId;
      const duration = elapsed;

      try {
        await db.media_files.put({
          id,
          noteId: "",
          type: isAudio ? "audio" : "video",
          blob,
          duration,
          createdAt: Date.now(),
          fileName: isAudio
            ? `Meeting Audio ${new Date().toLocaleDateString()}`
            : `Screen Recording ${new Date().toLocaleDateString()}`,
        });
      } catch (err) {
        console.error("[Offscreen] Failed to save media to DB:", err);
      }

      cleanup();
      state = "idle";
      const finalType = mode;
      mode = null;
      updateStorage();

      resolve({
        mediaId: id,
        duration,
        type: isAudio ? "audio" : "video",
      });
    };

    recorder.stop();
  });
}

function handleDiscard() {
  if (recorder && recorder.state !== "inactive") {
    recorder.stop();
  }
  cleanup();
  state = "idle";
  mode = null;
  elapsed = 0;
  pausedElapsed = 0;
  updateStorage();
}

// ─── Listeners ─────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case "OFFSCREEN_START_AUDIO":
      handleStartAudio(msg.streamId).then(success => sendResponse({ success }));
      return true;
    case "OFFSCREEN_START_SCREEN":
      handleStartScreen(msg.streamId).then(success => sendResponse({ success }));
      return true;
    case "OFFSCREEN_PAUSE":
      handlePause();
      sendResponse({ success: true });
      break;
    case "OFFSCREEN_RESUME":
      handleResume();
      sendResponse({ success: true });
      break;
    case "OFFSCREEN_STOP":
      handleStop().then(result => sendResponse({ success: !!result, result }));
      return true;
    case "OFFSCREEN_DISCARD":
      handleDiscard();
      sendResponse({ success: true });
      break;
    case "OFFSCREEN_PING":
      sendResponse({ pong: true });
      break;
  }
});

// Notify background that offscreen is ready
chrome.runtime.sendMessage({ type: "OFFSCREEN_READY" });
