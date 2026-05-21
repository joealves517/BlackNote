import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";

const vertexAI = new GoogleGenAI({
  vertexai: true,
  project: config.gcp.projectId,
  location: config.gcp.region,
});

const MODEL_NAME = "gemini-2.5-flash-lite";

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface GeminiTranscriptionResult {
  segments: TranscriptionSegment[];
  transcript: string;
  language: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

async function callGeminiTranscribe(client: GoogleGenAI, audioBase64: string, mimeType: string): Promise<GeminiTranscriptionResult> {
  const response = await client.models.generateContent({
    model: MODEL_NAME,
    contents: [
      {
        inlineData: {
          mimeType: mimeType || "audio/mpeg",
          data: audioBase64,
        },
      },
      {
        text: "Accurately transcribe this audio recording. Provide timestamps for each sentence or meaningful phrase. Return the results in the requested JSON structure.",
      },
    ],
    config: {
      systemInstruction: "You are an expert audio transcription system. Return only structured JSON containing the language, the overall transcript, and segments with start and end times in seconds.",
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          language: { type: "STRING" },
          transcript: { type: "STRING" },
          segments: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                start: { type: "NUMBER" },
                end: { type: "NUMBER" },
                text: { type: "STRING" },
              },
              required: ["start", "end", "text"],
            },
          },
        },
        required: ["language", "transcript", "segments"],
      },
    },
  });

  const rawText = (response.text || "{}").trim();
  try {
    const result = JSON.parse(rawText) as GeminiTranscriptionResult;
    result.usage = {
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    };
    return result;
  } catch (err) {
    console.error("[Gemini Transcribe] Failed to parse JSON response:", rawText);
    throw new Error("Invalid transcription format returned by AI.");
  }
}

export async function transcribeWithGemini(
  audioBase64: string,
  mimeType = "audio/mpeg",
  usePremium = false
): Promise<GeminiTranscriptionResult> {
  console.log(`[Gemini Transcribe] Routing directly to Vertex AI (Premium mode: ${usePremium})`);
  return callGeminiTranscribe(vertexAI, audioBase64, mimeType);
}
