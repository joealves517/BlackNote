/**
 * Audio compression and extraction utilities for media AI analysis.
 *
 * Handles:
 * - Extracting audio track from video blobs
 * - Compressing audio to MP3 (64kbps mono) for minimal upload size
 * - Chunking long audio into 20-minute segments for Groq API
 * - Converting blobs to base64
 */

import { Mp3Encoder } from "@breezystack/lamejs";

const CHUNK_DURATION_SEC = 1200; // 20 minutes per chunk (MP3 64kbps ≈ 9.4MB)
const TARGET_SAMPLE_RATE = 16000; // 16kHz mono — optimal for speech recognition
const MP3_BITRATE = 64; // 64kbps — good quality for speech, small file size

export interface AudioChunk {
  base64: string;
  mimeType: string;
  startSec: number;
  endSec: number;
  durationSec: number;
}

/**
 * Convert a Blob to base64 string (without data URL prefix).
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Downsample an AudioBuffer to target sample rate, mono channel.
 * Returns raw PCM Float32 samples.
 */
function downsampleToMono(
  audioBuffer: AudioBuffer,
  targetRate: number
): Float32Array {
  const sourceSampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;

  // Mix down to mono
  const monoSamples = new Float32Array(audioBuffer.length);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < audioBuffer.length; i++) {
      monoSamples[i] += channelData[i] / numChannels;
    }
  }

  // Resample if needed
  if (sourceSampleRate === targetRate) return monoSamples;

  const ratio = sourceSampleRate / targetRate;
  const newLength = Math.floor(monoSamples.length / ratio);
  const resampled = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const floor = Math.floor(srcIndex);
    const ceil = Math.min(floor + 1, monoSamples.length - 1);
    const frac = srcIndex - floor;
    resampled[i] = monoSamples[floor] * (1 - frac) + monoSamples[ceil] * frac;
  }

  return resampled;
}

/**
 * Convert Float32 PCM samples to Int16 (required by LAME encoder).
 */
function float32ToInt16(samples: Float32Array): Int16Array {
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

/**
 * Encode Int16 PCM samples into an MP3 blob using lamejs.
 * MP3 64kbps mono at 16kHz produces ~480KB per minute.
 */
function encodeMp3(samples: Int16Array, sampleRate: number): Blob {
  const encoder = new Mp3Encoder(1, sampleRate, MP3_BITRATE);
  const mp3Chunks: Uint8Array[] = [];

  // LAME processes in blocks of 1152 samples
  const blockSize = 1152;
  for (let i = 0; i < samples.length; i += blockSize) {
    const chunk = samples.subarray(i, i + blockSize);
    const mp3buf = encoder.encodeBuffer(chunk);
    if (mp3buf.length > 0) {
      mp3Chunks.push(new Uint8Array(mp3buf));
    }
  }

  // Flush remaining data
  const tail = encoder.flush();
  if (tail.length > 0) {
    mp3Chunks.push(new Uint8Array(tail));
  }

  return new Blob(mp3Chunks, { type: "audio/mpeg" });
}

/**
 * Extract audio from a media blob (audio or video).
 * Decodes using AudioContext, downsamples to 16kHz mono.
 * Returns raw PCM samples and duration for chunking.
 */
async function extractAndDecodeAudio(
  blob: Blob,
  onProgress?: (message: string) => void
): Promise<{ pcmSamples: Float32Array; durationSec: number }> {
  onProgress?.("Decoding audio...");

  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new OfflineAudioContext(1, 1, TARGET_SAMPLE_RATE);

  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch {
    // Fallback: try with standard AudioContext for broader codec support
    const ctx = new AudioContext();
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    await ctx.close();
  }

  const durationSec = audioBuffer.duration;
  onProgress?.(`Audio decoded: ${Math.round(durationSec)}s`);

  onProgress?.("Downsampling to 16kHz mono...");
  const pcmSamples = downsampleToMono(audioBuffer, TARGET_SAMPLE_RATE);

  return { pcmSamples, durationSec };
}

/**
 * Calculate chunk boundaries for a given duration.
 */
function calculateChunkRanges(
  durationSec: number,
  chunkDurationSec: number = CHUNK_DURATION_SEC
): { startSec: number; endSec: number }[] {
  if (durationSec <= chunkDurationSec) {
    return [{ startSec: 0, endSec: durationSec }];
  }

  const chunks: { startSec: number; endSec: number }[] = [];
  let start = 0;
  while (start < durationSec) {
    const end = Math.min(start + chunkDurationSec, durationSec);
    chunks.push({ startSec: start, endSec: end });
    start = end;
  }
  return chunks;
}

/**
 * Main entry point: Process a media blob into base64 MP3 chunks ready for API.
 *
 * Pipeline:
 * 1. Decode audio → 16kHz mono PCM
 * 2. Split into 20-minute chunks if needed
 * 3. Encode each chunk as MP3 64kbps
 * 4. Convert to base64
 */
export async function prepareAudioChunks(
  blob: Blob,
  onProgress?: (message: string) => void
): Promise<AudioChunk[]> {
  const { pcmSamples, durationSec } = await extractAndDecodeAudio(
    blob,
    onProgress
  );

  const ranges = calculateChunkRanges(durationSec);
  const samplesPerSecond = TARGET_SAMPLE_RATE;

  const chunks: AudioChunk[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    onProgress?.(
      `Encoding MP3 chunk ${i + 1}/${ranges.length}...`
    );

    // Slice PCM samples for this chunk
    const startSample = Math.floor(range.startSec * samplesPerSecond);
    const endSample = Math.min(
      Math.floor(range.endSec * samplesPerSecond),
      pcmSamples.length
    );
    const chunkPcm = pcmSamples.subarray(startSample, endSample);

    // Convert to Int16 and encode as MP3
    const int16Samples = float32ToInt16(chunkPcm);
    const mp3Blob = encodeMp3(int16Samples, TARGET_SAMPLE_RATE);
    const base64 = await blobToBase64(mp3Blob);

    onProgress?.(
      `Chunk ${i + 1}: ${(mp3Blob.size / 1024 / 1024).toFixed(1)}MB MP3`
    );

    chunks.push({
      base64,
      mimeType: "audio/mpeg",
      startSec: range.startSec,
      endSec: range.endSec,
      durationSec: range.endSec - range.startSec,
    });
  }

  onProgress?.(`${chunks.length} chunk(s) ready`);
  return chunks;
}

/**
 * Get audio duration without full decode (for quick checks).
 */
export async function getAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = isFinite(audio.duration) ? audio.duration : 0;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load audio metadata"));
    };
    audio.src = url;
  });
}
