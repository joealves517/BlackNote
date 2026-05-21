/**
 * Free Tier AI Service
 * Route directly to Vertex AI (Gemini 2.5 Flash Lite) for text generation.
 *
 * Prompts are managed centrally via the Prompt Registry (Factor 2).
 */

import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";
import { PROMPTS } from "../prompts/index.js";

// --- Clients ---
const ai = new GoogleGenAI({
  vertexai: true,
  project: config.gcp.projectId,
  location: config.gcp.region,
});

// --- Constants ---
const GEMINI_MODEL = "gemini-2.5-flash-lite";

interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

function handleAiError(error: any, callbacks: StreamCallbacks) {
  console.error("[AI Free] Vertex AI Error:", error?.message || error);
  callbacks.onError(new Error("We are facing high traffic. Please try again later."));
}

export async function streamFreeWritingAI(
  text: string,
  option: string,
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal,
  command?: string,
  history?: { role: string; content: string }[],
  noteContext?: string,
  files?: { mimeType: string; data: string }[]
): Promise<void> {

  let userPrompt: string;
  if (option === "chat") {
    userPrompt = text;
  } else if (option === "zap" && command) {
    userPrompt = `${command}\n\n${text}`;
  } else if (option === "import_file") {
    const importPrefix = PROMPTS.writing.options.import_file;
    userPrompt = `${importPrefix}\n\n${text}`;
  } else {
    const prefix = PROMPTS.writing.options[option] || PROMPTS.writing.options.improve;
    userPrompt = `${prefix}\n\n${text}`;
  }

  let sysInstruction: string = PROMPTS.writing.system;
  if (option === "chat") {
    sysInstruction = PROMPTS.chat.buildSystemPrompt({
      noteTitle: "",
      noteContent: noteContext || "",
      mediaContext: "",
    });
  }

  return streamGemini(userPrompt, option, sysInstruction, callbacks, abortSignal, history, files);
}

async function streamGemini(
  userPrompt: string,
  option: string,
  sysInstruction: string,
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal,
  history?: { role: string; content: string }[],
  files?: { mimeType: string; data: string }[]
) {
  const contents: any[] = [];

  if (history && history.length > 0) {
    history.forEach(msg => {
      if (!msg.content) return;
      contents.push({
        role: msg.role === "ai" || msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }]
      });
    });
  }

  const parts: any[] = [{ text: userPrompt }];

  if (files && files.length > 0) {
    files.forEach(file => {
      parts.push({
        inlineData: {
          mimeType: file.mimeType,
          data: file.data
        }
      });
    });
  }

  contents.push({ role: "user", parts });

  try {
    const response = await ai.models.generateContentStream({
      model: GEMINI_MODEL,
      contents: contents,
      config: {
        systemInstruction: sysInstruction,
        temperature: option === "chat" ? 0.7 : 0.3,
        maxOutputTokens: 4096,
      },
    });

    for await (const chunk of response) {
      if (abortSignal?.aborted) {
        callbacks.onDone();
        return;
      }
      const chunkText = chunk.text;
      if (chunkText) {
        callbacks.onToken(chunkText);
      }
    }
    callbacks.onDone();
  } catch (error) {
    return handleAiError(error, callbacks);
  }
}
