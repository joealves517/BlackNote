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
import { supabase } from "@/lib/supabase";

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
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
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
  mediaId: string
): Promise<MediaTranscript | null> {
  try {
    const record = await db.media_transcripts.get(mediaId);
    return record || null;
  } catch {
    return null;
  }
}

export async function hasTranscript(mediaId: string): Promise<boolean> {
  const record = await getTranscript(mediaId);
  return record !== null && record.transcript.length > 0;
}

// ─── Analyze (Transcribe) ─────────────────────────────────────────

export async function analyzeMedia(
  mediaId: string,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<MediaTranscript> {
  // Check cache first
  const cached = await getTranscript(mediaId);
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

  const chunks = await prepareAudioChunks(mediaFile.blob, (msg) => {
    onProgress?.({
      step: "compressing",
      message: msg,
      percent: 20,
    });
  });

  // Step 3: Transcribe each chunk
  const allSegments: { start: number; end: number; text: string }[] = [];
  let timeOffset = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkPercent = 30 + (60 * (i + 1)) / chunks.length;

    onProgress?.({
      step: "transcribing",
      message: `Transcribing${chunks.length > 1 ? ` chunk ${i + 1}/${chunks.length}` : ""}...`,
      percent: chunkPercent,
    });

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

    const data = await response.json();

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

  await db.media_transcripts.put(transcriptRecord);

  onProgress?.({ step: "done", message: "Analysis complete", percent: 100 });
  return transcriptRecord;
}

// ─── Summarize ────────────────────────────────────────────────────

export async function summarizeMedia(
  mediaId: string,
  style: SummarizeStyle,
  mediaType: "audio" | "video"
): Promise<SummaryResult> {
  const transcript = await getTranscript(mediaId);
  if (!transcript) {
    throw new Error("Recording must be analyzed first.");
  }

  const token = await getAuthToken();

  const response = await fetch(`${AI_API_BASE}/api/media/summarize`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      transcript: transcript.transcript,
      style,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Summarization failed");
  }

  const data = await response.json();
  const result: SummaryResult = { text: data.summary };

  // For video summaries, extract keyframes to enrich the output
  if (mediaType === "video" && style === "summary") {
    try {
      const mediaFile = await db.media_files.get(mediaId);
      if (mediaFile?.blob) {
        const kfResponse = await fetch(`${AI_API_BASE}/api/media/keyframes`, {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({
            transcript: transcript.transcript,
            durationSec: mediaFile.duration,
            maxFrames: 6,
          }),
        });

        if (kfResponse.ok) {
          const kfData = await kfResponse.json();
          if (kfData.timestamps?.length > 0) {
            result.keyframes = await extractKeyframes(
              mediaFile.blob,
              kfData.timestamps
            );
          }
        }
      }
    } catch (err) {
      console.warn("[MediaAI] Keyframe extraction failed, returning text only:", err);
    }
  }

  return result;
}

// ─── Translate ────────────────────────────────────────────────────

export async function translateMedia(
  mediaId: string,
  targetLang: string
): Promise<TranslateResult> {
  const transcript = await getTranscript(mediaId);
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
  mediaId: string
): Promise<TitleResult> {
  const transcript = await getTranscript(mediaId);
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
  noteContent: string
): Promise<Map<string, MediaTranscript>> {
  const transcripts = new Map<string, MediaTranscript>();

  try {
    const doc = JSON.parse(noteContent);
    const mediaIds = extractMediaIds(doc);

    for (const id of mediaIds) {
      const transcript = await getTranscript(id);
      if (transcript) {
        transcripts.set(id, transcript);
      }
    }
  } catch {
    // Invalid JSON — no media nodes
  }

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
