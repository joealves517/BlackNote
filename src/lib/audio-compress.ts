/**
 * Audio compression and extraction utilities for media AI analysis.
 *
 * Handles:
 * - Extracting audio track from video blobs
 * - Compressing audio to reduce upload size
 * - Chunking long audio into segments for API calls
 * - Converting blobs to base64
 */

const CHUNK_DURATION_SEC = 300; // 5 minutes per chunk
const TARGET_SAMPLE_RATE = 16000; // 16kHz mono — optimal for speech recognition

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
 * Encode Float32 PCM samples into a WAV blob (16-bit PCM).
 * WAV is universally supported by Gemini's audio processing.
 */
function encodeWav(
  samples: Float32Array,
  sampleRate: number
): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // PCM samples (clamp to 16-bit range)
  let offset = headerSize;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Extract audio from a media blob (audio or video).
 * Decodes using AudioContext, downsamples to 16kHz mono, encodes as WAV.
 */
async function extractAndCompressAudio(
  blob: Blob,
  onProgress?: (message: string) => void
): Promise<{ wavBlob: Blob; durationSec: number }> {
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

  onProgress?.("Compressing audio...");
  const monoSamples = downsampleToMono(audioBuffer, TARGET_SAMPLE_RATE);
  const wavBlob = encodeWav(monoSamples, TARGET_SAMPLE_RATE);

  onProgress?.(
    `Compressed: ${(blob.size / 1024 / 1024).toFixed(1)}MB → ${(wavBlob.size / 1024 / 1024).toFixed(1)}MB`
  );

  return { wavBlob, durationSec };
}

/**
 * Split a WAV blob into time-based chunks.
 * Each chunk is a standalone WAV file.
 */
function splitWavIntoChunks(
  wavBlob: Blob,
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
 * Extract a time slice from a WAV blob (16-bit mono PCM).
 * Reads the header, calculates byte offsets, and creates a new WAV blob.
 */
async function sliceWav(
  wavBlob: Blob,
  startSec: number,
  endSec: number,
  sampleRate: number = TARGET_SAMPLE_RATE
): Promise<Blob> {
  const buffer = await wavBlob.arrayBuffer();
  const headerSize = 44;
  const bytesPerSample = 2; // 16-bit
  const totalSamples = (buffer.byteLength - headerSize) / bytesPerSample;
  const totalDuration = totalSamples / sampleRate;

  // Clamp times
  const clampedStart = Math.max(0, startSec);
  const clampedEnd = Math.min(totalDuration, endSec);

  const startByte =
    headerSize + Math.floor(clampedStart * sampleRate) * bytesPerSample;
  const endByte =
    headerSize + Math.floor(clampedEnd * sampleRate) * bytesPerSample;
  const dataSlice = buffer.slice(startByte, endByte);
  const dataSize = dataSlice.byteLength;

  // Build new WAV header
  const newBuffer = new ArrayBuffer(headerSize + dataSize);
  const src = new DataView(buffer);
  const dst = new DataView(newBuffer);

  // Copy original header and update sizes
  for (let i = 0; i < headerSize; i++) {
    dst.setUint8(i, src.getUint8(i));
  }
  dst.setUint32(4, 36 + dataSize, true); // RIFF size
  dst.setUint32(40, dataSize, true); // data size

  // Copy audio data
  new Uint8Array(newBuffer, headerSize).set(new Uint8Array(dataSlice));

  return new Blob([newBuffer], { type: "audio/wav" });
}

/**
 * Main entry point: Process a media blob into base64 chunks ready for API.
 *
 * Workflow:
 * 1. Decode and compress audio (16kHz mono WAV)
 * 2. Split into 5-minute chunks if needed
 * 3. Convert each chunk to base64
 */
export async function prepareAudioChunks(
  blob: Blob,
  onProgress?: (message: string) => void
): Promise<AudioChunk[]> {
  const { wavBlob, durationSec } = await extractAndCompressAudio(
    blob,
    onProgress
  );

  const ranges = splitWavIntoChunks(wavBlob, durationSec);

  const chunks: AudioChunk[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    onProgress?.(
      `Preparing chunk ${i + 1}/${ranges.length}...`
    );

    let chunkBlob: Blob;
    if (ranges.length === 1) {
      chunkBlob = wavBlob; // No slicing needed for single chunk
    } else {
      chunkBlob = await sliceWav(wavBlob, range.startSec, range.endSec);
    }

    const base64 = await blobToBase64(chunkBlob);

    chunks.push({
      base64,
      mimeType: "audio/wav",
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
