/**
 * Media AI Service — Client-side orchestrator for all media analysis features.
 *
 * Coordinates: audio extraction → compression → chunked transcription → AI features.
 * Results are cached in IndexedDB (media_transcripts table) to avoid re-processing.
 */

import { db, type MediaTranscript } from "@/lib/local-db";
import { prepareAudioChunks } from "@/lib/audio-compress";
import { extractKeyframes } from "@/lib/keyframe-extract";
import { AI_API_BASE } from "@/lib/constants";
import { getAuthToken as fetchGoogleToken } from "@/lib/auth-client";

// ─── Types ────────────────────────────────────────────────────────

export type AnalysisStep =
  | "loading"
  | "extracting"
  | "compressing"
  | "transcribing"
  | "saving"
  | "done"
  | "error";

export interface AnalysisProgress {
  step: AnalysisStep;
  message: string;
  percent: number;
}

export type SummarizeStyle =
  | "summary"
  | "keypoints"
  | "action_items"
  | "chapters"
  | "translate"
  | "title";

export interface SummaryResult {
  text: string;
  keyframes?: { time: number; label: string; imageDataUrl: string }[];
}

export interface TranslateResult {
  translatedSegments: { start: number; end: number; text: string }[];
}

export interface TitleResult {
  title: string;
  description: string;
  tags: string[];
}

// ─── Auth Helper ──────────────────────────────────────────────────

async function getAuthToken(): Promise<string | null> {
  return fetchGoogleToken();
}

function authHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// ─── Cached Transcript Lookup ─────────────────────────────────────

export async function getTranscript(
  mediaId: string,
  noteId?: string
): Promise<MediaTranscript | null> {
  try {
    if (noteId) {
      const note = await db.notes.get(noteId);
      if (note && note.mediaTranscripts) {
        const transcripts = JSON.parse(note.mediaTranscripts);
        if (transcripts[mediaId]) return transcripts[mediaId];
      }
    }
    // Fallback for older notes
    const record = await db.media_transcripts.get(mediaId);
    return record || null;
  } catch {
    return null;
  }
}

export async function hasTranscript(mediaId: string, noteId?: string): Promise<boolean> {
  const record = await getTranscript(mediaId, noteId);
  return record !== null && record.transcript.length > 0;
}

// ─── Analyze (Transcribe) ─────────────────────────────────────────

export async function analyzeMedia(
  mediaId: string,
  noteId: string,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<MediaTranscript> {
  // Check cache first
  const cached = await getTranscript(mediaId, noteId);
  if (cached) {
    onProgress?.({ step: "done", message: "Already analyzed", percent: 100 });
    return cached;
  }

  const token = await getAuthToken();
  if (!token) {
    throw new Error("Authentication required. Please sign in first.");
  }

  // Step 1: Load blob from IndexedDB
  onProgress?.({ step: "loading", message: "Loading recording...", percent: 5 });
  const mediaFile = await db.media_files.get(mediaId);
  if (!mediaFile?.blob) {
    throw new Error("Recording not found or unavailable on this device.");
  }

  // Step 2: Extract and compress audio
  onProgress?.({
    step: "extracting",
    message: "Extracting audio...",
    percent: 10,
  });

    // Look for pre-processed chunks
    const storedChunks = await db.media_chunks.where("mediaId").equals(mediaId).toArray();
    const allSegments: { start: number; end: number; text: string }[] = [];
    let timeOffset = 0;
    
    if (storedChunks.length > 0) {
      storedChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      
      // Wait for any pending/processing chunks to finish (max 30s)
      onProgress?.({ step: "transcribing", message: "Assembling pre-processed chunks...", percent: 20 });
      let allDone = false;
      let waitCount = 0;
      while (!allDone && waitCount < 15) {
        allDone = true;
        for (const chunk of storedChunks) {
          const freshChunk = await db.media_chunks.get(chunk.id);
          if (freshChunk?.status === "pending" || freshChunk?.status === "processing") {
            allDone = false;
          }
        }
        if (!allDone) {
          await new Promise(r => setTimeout(r, 2000));
          waitCount++;
        }
      }

      for (const chunk of storedChunks) {
        const freshChunk = await db.media_chunks.get(chunk.id);
        if (freshChunk?.status === "done" && freshChunk.segments) {
          const offsetSegments = freshChunk.segments.map(s => ({
            start: s.start + timeOffset,
            end: s.end + timeOffset,
            text: s.text,
          }));
          allSegments.push(...offsetSegments);
          timeOffset += freshChunk.duration;
        }
      }
      
      if (allSegments.length > 0) {
        const fullTranscript = allSegments.map(s => s.text).join(" ");
        const result: MediaTranscript = {
          mediaId,
          segments: allSegments,
          transcript: fullTranscript,
          language: "en",
          analyzedAt: Date.now(),
        };
        await db.media_transcripts.put(result);
        
        for (const chunk of storedChunks) {
          await db.media_chunks.delete(chunk.id);
        }
        
        onProgress?.({ step: "saving", message: "Saving transcript...", percent: 95 });
        onProgress?.({ step: "done", message: "Transcription complete", percent: 100 });
        return result;
      }
    }

    // Standard fallback extraction (if no chunks were recorded or they failed)
    const chunks = await prepareAudioChunks(mediaFile.blob, (msg) => {
      onProgress?.({
        step: "compressing",
        message: msg,
        percent: 20,
      });
    });

    // Step 3: Transcribe each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
    const chunkPercent = 30 + (60 * (i + 1)) / chunks.length;

    onProgress?.({
      step: "transcribing",
      message: `Transcribing${chunks.length > 1 ? ` chunk ${i + 1}/${chunks.length}` : ""}...`,
      percent: chunkPercent,
    });

    let success = false;
    let attempt = 1;
    let data: any = null;

    while (!success && attempt <= 3) {
      try {
        const response = await fetch(`${AI_API_BASE}/api/media/transcribe`, {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({
            audioBase64: chunk.base64,
            mimeType: chunk.mimeType,
            audioDurationSec: chunk.durationSec,
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || `Transcription failed (${response.status})`);
        }

        data = await response.json();
        success = true;
      } catch (err: any) {
        if (attempt >= 3) {
          throw err;
        }
        onProgress?.({
          step: "retrying",
          message: `Retrying (${attempt}/3)...`,
          percent: chunkPercent,
        });
        await new Promise((r) => setTimeout(r, attempt * 3000));
        attempt++;
      }
    }

    // Offset timestamps for multi-chunk recordings
    if (data.segments && Array.isArray(data.segments)) {
      const offsetSegments = data.segments.map(
        (s: { start: number; end: number; text: string }) => ({
          start: s.start + timeOffset,
          end: s.end + timeOffset,
          text: s.text,
        })
      );
      allSegments.push(...offsetSegments);
    }

    timeOffset = chunk.endSec;
  }

  // Step 4: Save to cache
  onProgress?.({ step: "saving", message: "Saving transcript...", percent: 95 });

  const fullTranscript = allSegments.map((s) => s.text).join(" ");

  const transcriptRecord: MediaTranscript = {
    mediaId,
    segments: allSegments,
    transcript: fullTranscript,
    language: "auto",
    analyzedAt: Date.now(),
  };

  // Save to fallback DB immediately to avoid 400ms debounce race condition
  await db.media_transcripts.put(transcriptRecord);

  // Dispatch global event for App.tsx to save in note and sync
  window.dispatchEvent(
    new CustomEvent("save-transcript", {
      detail: { noteId, transcriptRecord },
    })
  );

  onProgress?.({ step: "done", message: "Analysis complete", percent: 100 });
  return transcriptRecord;
}

// ─── Real-time Chunking ──────────────────────────────────────────

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => {
      const base64data = (reader.result as string).split(",")[1];
      resolve(base64data);
    };
    reader.onerror = reject;
  });
};

export async function transcribeChunk(mediaId: string, chunkId: string) {
  const chunk = await db.media_chunks.get(chunkId);
  if (!chunk || chunk.status !== "pending") return;

  try {
    await db.media_chunks.update(chunkId, { status: "processing" });
    const token = await getAuthToken();
    if (!token) throw new Error("No token");

    const base64 = await blobToBase64(chunk.blob);
    
    let success = false;
    let attempt = 1;
    let data: any = null;

    while (!success && attempt <= 3) {
      try {
        const response = await fetch(`${AI_API_BASE}/api/media/transcribe`, {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({
            audioBase64: base64,
            mimeType: chunk.blob.type,
            audioDurationSec: chunk.duration,
          }),
        });

        if (!response.ok) throw new Error("Failed");
        data = await response.json();
        success = true;
      } catch {
        if (attempt >= 3) throw new Error("Failed after 3 attempts");
        await new Promise((r) => setTimeout(r, attempt * 3000));
        attempt++;
      }
    }

    await db.media_chunks.update(chunkId, {
      status: "done",
      transcript: data.transcript,
      segments: data.segments,
    });
  } catch (err) {
    console.error("[MediaAI] Chunk transcribe failed:", err);
    await db.media_chunks.update(chunkId, { status: "error" });
  }
}

// ─── Summarize ────────────────────────────────────────────────────

export async function summarizeMedia(
  mediaId: string,
  noteId: string,
  style: SummarizeStyle,
  mediaType: "audio" | "video"
): Promise<SummaryResult> {
  const transcript = await getTranscript(mediaId, noteId);
  if (!transcript) {
    throw new Error("Recording must be analyzed first.");
  }

  const token = await getAuthToken();

  // Create a timestamped transcript so the AI knows exactly when things happen
  let finalTranscript = transcript.transcript;
  
  if (mediaType === "video") {
    finalTranscript = transcript.segments
      .map((s) => `[${Math.floor(s.start)}s] ${s.text}`)
      .join("\n");
  }

  const response = await fetch(`${AI_API_BASE}/api/media/summarize`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      transcript: finalTranscript,
      style,
      isVideo: mediaType === "video",
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Summarization failed");
  }

  const data = await response.json();
  const result: SummaryResult = { text: data.summary };

  return result;
}

// ─── Translate ────────────────────────────────────────────────────

export async function translateMedia(
  mediaId: string,
  noteId: string,
  targetLang: string
): Promise<TranslateResult> {
  const transcript = await getTranscript(mediaId, noteId);
  if (!transcript) {
    throw new Error("Recording must be analyzed first.");
  }

  const token = await getAuthToken();

  const response = await fetch(`${AI_API_BASE}/api/media/translate`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      segments: transcript.segments,
      targetLang,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Translation failed");
  }

  return await response.json();
}

// ─── Smart Title ──────────────────────────────────────────────────

export async function generateTitle(
  mediaId: string,
  noteId: string
): Promise<TitleResult> {
  const transcript = await getTranscript(mediaId, noteId);
  if (!transcript) {
    throw new Error("Recording must be analyzed first.");
  }

  const token = await getAuthToken();

  const response = await fetch(`${AI_API_BASE}/api/media/title`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      transcript: transcript.transcript,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Title generation failed");
  }

  return await response.json();
}

// ─── Helper: Get all transcripts for media nodes in a note ────────

export async function getTranscriptsForNote(
  noteId: string,
  noteContent: string
): Promise<Map<string, MediaTranscript>> {
  const transcripts = new Map<string, MediaTranscript>();

  try {
    let mediaIds: string[] = [];
    try {
      const doc = JSON.parse(noteContent);
      mediaIds = extractMediaIds(doc);
    } catch {
      return transcripts;
    }

    if (mediaIds.length === 0) return transcripts;

    const noteRaw = await db.notes.get(noteId);
    let noteTranscripts: Record<string, MediaTranscript> = {};
    if (noteRaw && noteRaw.mediaTranscripts) {
      try {
        noteTranscripts = JSON.parse(noteRaw.mediaTranscripts);
      } catch {}
    }

    for (const id of mediaIds) {
      const t = noteTranscripts[id] || await getTranscript(id);
      if (t) transcripts.set(id, t);
    }
  } catch {}

  return transcripts;
}

/**
 * Recursively extract mediaIds from a ProseMirror document JSON.
 */
function extractMediaIds(node: any): string[] {
  let ids: string[] = [];
  if (
    (node.type === "audioNode" || node.type === "videoNode") &&
    node.attrs?.mediaId &&
    node.attrs?.status === "saved"
  ) {
    ids.push(node.attrs.mediaId);
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      ids = ids.concat(extractMediaIds(child));
    }
  }
  return ids;
}
