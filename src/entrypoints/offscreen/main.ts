import { db } from "@/lib/local-db";
import fixWebmDurationMod from "webm-duration-fix";

// ─── Constants & Types ─────────────────────────────────────────────

type RecordingMode = "audio" | "screen";
type RecordingState = "idle" | "requesting" | "recording" | "paused" | "saving";

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let streams: MediaStream[] = [];
let audioCtx: AudioContext | null = null;

let chunkRecorder: MediaRecorder | null = null;
let currentChunkData: Blob[] = [];
let chunkIndex = 0;
let lastChunkStartTime = 0;

let state: RecordingState = "idle";
let mode: RecordingMode | null = null;
let mediaId = "";
let elapsed = 0;
let pausedElapsed = 0;
let startTime = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let isUserPremium = false;
let pendingPuts: Promise<any>[] = [];

// -- Cropping state --
let cropRafId: number | null = null;
let cropVideo: HTMLVideoElement | null = null;

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
    
    // Every 20 mins (1200 seconds), rotate the chunk
    if (elapsed > 0 && elapsed % 1200 === 0 && chunkRecorder && chunkRecorder.state === "recording") {
      chunkRecorder.stop();
      chunkRecorder.start();
    }
    
    // Free tier limit: Stop recording at 1200 seconds (20 mins)
    if (!isUserPremium && elapsed >= 1200) {
      handleStop().then(result => {
        chrome.runtime.sendMessage({ type: "OFFSCREEN_LIMIT_REACHED", result });
      });
    } else {
      updateStorage();
    }
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
  if (cropRafId !== null) {
    cancelAnimationFrame(cropRafId);
    cropRafId = null;
  }
  if (cropVideo) {
    cropVideo.srcObject = null;
    cropVideo = null;
  }
  streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
  streams = [];
  recorder = null;
  chunks = [];
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  if (chunkRecorder) {
    if (chunkRecorder.state !== "inactive") chunkRecorder.stop();
    chunkRecorder = null;
  }
  currentChunkData = [];
  chunkIndex = 0;
}

function startChunkRecorder(stream: MediaStream) {
  try {
    const mimeType = selectMimeType(true);
    chunkRecorder = new MediaRecorder(stream, { mimeType });
    chunkRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) currentChunkData.push(e.data);
    };
    chunkRecorder.onstop = async () => {
      if (currentChunkData.length === 0) return;
      const blob = new Blob(currentChunkData, { type: chunkRecorder?.mimeType || "audio/webm" });
      currentChunkData = [];
      const duration = (Date.now() - lastChunkStartTime) / 1000;
      const currentMediaId = mediaId; // capture closure
      const currentIdx = chunkIndex;
      chunkIndex++;
      
      const chunkId = `${currentMediaId}_chunk_${currentIdx}`;
      try {
        await db.media_chunks.put({
          id: chunkId,
          mediaId: currentMediaId,
          chunkIndex: currentIdx,
          blob,
          duration,
          status: "pending"
        });
        chrome.runtime.sendMessage({ type: "TRANSCRIBE_CHUNK", payload: { mediaId: currentMediaId, chunkId } });
      } catch (err) {
        console.error("[Offscreen] Failed to save chunk:", err);
      }
    };
    chunkRecorder.start();
    lastChunkStartTime = Date.now();
  } catch (err) {
    console.error("[Offscreen] Failed to start chunk recorder:", err);
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
    pendingPuts = [];
    
    let mainChunkIndex = 0;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        const idx = mainChunkIndex++;
        const p = db.media_temp_chunks.put({
          id: `${mediaId}_${idx}`,
          mediaId: mediaId,
          chunkIndex: idx,
          blob: e.data
        });
        pendingPuts.push(p);
      }
    };

    // Auto-stop if all tracks end
    finalStream.getTracks().forEach((track) => {
      track.onended = () => {
        if (state === "recording" || state === "paused") {
          chrome.runtime.sendMessage({ type: "OFFSCREEN_TRIGGER_STOP" });
        }
      };
    });

    recorder.start(10000); // 10s slices
    
    // Start background chunking for AI
    startChunkRecorder(finalStream);
    
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

async function handleStartScreen(streamId: string, cropRect?: { x: number, y: number, width: number, height: number }) {
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

    let finalVideoStream = displayStream;

    // --- CANVAS CROP ---
    if (cropRect && cropRect.width > 0 && cropRect.height > 0) {
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = cropRect.width;
      cropCanvas.height = cropRect.height;
      const cropCtx = cropCanvas.getContext("2d");
      
      cropVideo = document.createElement("video");
      cropVideo.srcObject = new MediaStream(displayStream.getVideoTracks());
      cropVideo.muted = true;
      cropVideo.play();
      
      const draw = () => {
        if (cropCtx && cropVideo && cropVideo.readyState >= 2) {
          cropCtx.drawImage(
            cropVideo, 
            cropRect.x, cropRect.y, cropRect.width, cropRect.height, 
            0, 0, cropRect.width, cropRect.height
          );
        }
        cropRafId = requestAnimationFrame(draw);
      };
      draw();
      
      const canvasStream = cropCanvas.captureStream(30);
      finalVideoStream = canvasStream;
      // We do not stop the displayStream tracks here, as they are needed to feed the canvas.
    }

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
        ...finalVideoStream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);
    } catch {
      console.warn("[Offscreen] Mic unavailable for screen recording");
      finalStream = new MediaStream([
        ...finalVideoStream.getVideoTracks(),
        ...displayStream.getAudioTracks(),
      ]);
    }

    const mimeType = selectMimeType(false);
    recorder = new MediaRecorder(finalStream, { mimeType });
    pendingPuts = [];
    
    let mainChunkIndex = 0;
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        const idx = mainChunkIndex++;
        const p = db.media_temp_chunks.put({
          id: `${mediaId}_${idx}`,
          mediaId: mediaId,
          chunkIndex: idx,
          blob: e.data
        });
        pendingPuts.push(p);
      }
    };

    displayStream.getVideoTracks().forEach((track) => {
      track.onended = () => {
        if (state === "recording" || state === "paused") {
          chrome.runtime.sendMessage({ type: "OFFSCREEN_TRIGGER_STOP" });
        }
      };
    });
    recorder.start(10000); // 10s slices
    
    // Start background chunking for AI (audio only stream)
    const audioStream = new MediaStream(finalStream.getAudioTracks());
    if (audioStream.getTracks().length > 0) {
      startChunkRecorder(audioStream);
    }
    
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
    if (chunkRecorder && chunkRecorder.state === "recording") chunkRecorder.pause();
    stopTimer();
    pausedElapsed += Date.now() - startTime;
    updateStorage("paused");
  }
}

function handleResume() {
  if (recorder && recorder.state === "paused") {
    recorder.resume();
    if (chunkRecorder && chunkRecorder.state === "paused") {
      chunkRecorder.resume();
      lastChunkStartTime += (Date.now() - startTime); // Adjust duration calculation
    }
    startTimer();
    updateStorage("recording");
  }
}

function handleStop(): Promise<{ mediaId: string; duration: number; type: "audio" | "video" } | null> {
  if (!recorder || recorder.state === "inactive") {
      cleanup();
      state = "idle";
      mode = null;
      updateStorage();
      return Promise.resolve(null);
    }

    updateStorage("saving");
    return new Promise((resolve) => {
      recorder!.onstop = async () => {
        await Promise.all(pendingPuts);
        
        const currentMediaId = mediaId;
        const tempChunks = await db.media_temp_chunks.where("mediaId").equals(currentMediaId).sortBy("chunkIndex");
        const blobs = tempChunks.map(c => c.blob);
        
        const isAudio = mode === "audio";
        let blob = new Blob(blobs.length > 0 ? blobs : chunks, { type: recorder?.mimeType || (isAudio ? "audio/webm" : "video/webm") });
        
        if (blobs.length > 0) {
          await db.media_temp_chunks.where("mediaId").equals(currentMediaId).delete();
        }
        
        const id = mediaId;
        const duration = elapsed;

        try {
          // Fix WebM duration so the blob is fully seekable instantly without decoding
          const fixFn = (typeof fixWebmDurationMod === "function") ? fixWebmDurationMod : (fixWebmDurationMod as any).default;
          if (typeof fixFn === "function") {
            blob = await fixFn(blob, duration * 1000);
          }
        } catch (err) {
          console.warn("[Offscreen] Failed to fix WebM duration, saving raw blob:", err);
        }

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
      isUserPremium = !!msg.isPremium;
      handleStartAudio(msg.streamId).then(success => sendResponse({ success }));
      return true;
    case "OFFSCREEN_START_SCREEN":
      isUserPremium = !!msg.isPremium;
      handleStartScreen(msg.streamId, msg.cropRect).then(success => sendResponse({ success }));
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
