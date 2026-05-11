/**
 * Extract keyframe images from a video blob at specific timestamps.
 * Runs entirely client-side using <video> + <canvas>.
 *
 * Process: seek → wait for seeked event → draw to canvas → export as webp.
 * Sequential execution prevents memory spikes with long videos.
 */

interface KeyframeResult {
  time: number;
  label: string;
  imageDataUrl: string;
}

/**
 * Extract frames from a video at the given timestamps.
 * Returns base64 webp images suitable for inline display.
 */
import fixWebmDurationMod from "webm-duration-fix";

export async function extractKeyframes(
  videoBlob: Blob,
  timestamps: { time: number; label: string }[],
  onProgress?: (current: number, total: number) => void
): Promise<KeyframeResult[]> {
  if (timestamps.length === 0) return [];

  // Fix WebM duration on the fly so seeking is instant, even for old broken recordings
  let fixedBlob = videoBlob;
  try {
    // We don't need to know the exact duration here, just injecting the dummy metadata
    // makes Chrome rebuild the index so seeking works instantly!
    // ESM interop: handle both default and direct function exports
    const fixFn = (typeof fixWebmDurationMod === "function") ? fixWebmDurationMod : (fixWebmDurationMod as any).default;
    if (typeof fixFn === "function") {
      fixedBlob = await fixFn(videoBlob);
    }
  } catch (err) {
    console.warn("[KeyframeExtract] Failed to fix blob duration:", err);
  }

  const videoUrl = URL.createObjectURL(fixedBlob);

  try {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    // Wait for video metadata to load
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Failed to load video"));
      video.src = videoUrl;
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    // Scale down for thumbnails (max 640px wide)
    const maxWidth = 640;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const results: KeyframeResult[] = [];

    // Process timestamps sequentially to avoid memory issues
    for (let i = 0; i < timestamps.length; i++) {
      const { time, label } = timestamps[i];
      onProgress?.(i + 1, timestamps.length);

      // Clamp to valid range (avoid seeking past duration)
      const seekTime = Math.max(0, Math.min(time, video.duration - 0.1));

      try {
        const imageDataUrl = await captureFrame(video, canvas, ctx, seekTime);
        results.push({ time, label, imageDataUrl });
      } catch (err) {
        console.warn(`[KeyframeExtract] Failed at ${time}s:`, err);
        // Skip failed frames instead of crashing
      }
    }

    return results;
  } finally {
    URL.revokeObjectURL(videoUrl);
  }
}

/**
 * Seek to a specific time and capture the frame as a data URL.
 * Uses requestVideoFrameCallback when available for precise frame capture.
 */
function captureFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  time: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    
    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("timeupdate", onTimeUpdate);
      
      // If we timed out, check if we at least have some data we can draw
      if (video.readyState >= 2) {
        drawAndResolve();
      } else {
        reject(new Error(`Seek timeout at ${time}s`));
      }
    }, 15000); // 15 seconds! Cue-less WebM Blob seeking requires decoding from start

    const drawAndResolve = () => {
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Check for black frame
        const sample = ctx.getImageData(
          Math.floor(canvas.width / 2),
          Math.floor(canvas.height / 2),
          1,
          1
        ).data;
        const isBlack = sample[0] + sample[1] + sample[2] < 15;

        if (isBlack) {
          setTimeout(() => {
            if (!resolved) return; // Prevent double resolve if not careful, but here it's fine
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/webp", 0.7));
          }, 300);
        } else {
          resolve(canvas.toDataURL("image/webp", 0.7));
        }
      } catch (err) {
        reject(err);
      }
    };

    const onSeeked = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("timeupdate", onTimeUpdate);

      if ("requestVideoFrameCallback" in video) {
        (video as any).requestVideoFrameCallback(() => {
          drawAndResolve();
        });
        video.play().then(() => video.pause()).catch(() => {
          drawAndResolve();
        });
      } else {
        setTimeout(drawAndResolve, 100);
      }
    };

    const onTimeUpdate = () => {
      if (video.currentTime >= time - 0.1) {
        if (!resolved) video.pause(); // Pause immediately to not overshoot too much
        onSeeked();
      }
    };

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("timeupdate", onTimeUpdate);
    
    video.currentTime = time;
    
    // Fallback: If currentTime doesn't change because of cue-less WebM, play it fast!
    setTimeout(() => {
      if (!resolved && video.currentTime < time - 1) {
        video.playbackRate = 16.0;
        video.muted = true;
        video.play().catch(() => {});
      }
    }, 500);
  });
}
