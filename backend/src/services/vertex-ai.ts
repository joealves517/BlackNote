/**
 * Premium Vertex AI Gemini — for paid users with credits.
 * Adapted for BlackNote: AI writing assistant prompts.
 *
 * Prompts are managed centrally via the Prompt Registry (Factor 2).
 */

import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";
import { PROMPTS } from "../prompts/index.js";

const ai = new GoogleGenAI({
  vertexai: true,
  project: config.gcp.projectId,
  location: config.gcp.region,
});

const MODEL_NAME = "gemini-2.5-flash-lite";

interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (usage?: { inputTokens: number; outputTokens: number }) => void;
  onError: (error: Error) => void;
}

export async function streamWritingAI(
  text: string,
  option: string,
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal,
  command?: string,
  history?: { role: string; content: string }[],
  noteContext?: string,
  files?: { mimeType: string; data: string }[]
): Promise<void> {
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

  let sysInstruction: string = PROMPTS.writing.system;
  if (option === "chat") {
    sysInstruction = PROMPTS.chat.buildSystemPrompt({
      noteTitle: "",
      noteContent: noteContext || "",
      mediaContext: "",
    });
  }

  try {
    const response = await ai.models.generateContentStream({
      model: MODEL_NAME,
      contents: contents,
      config: {
        systemInstruction: sysInstruction,
        temperature: option === "chat" ? 0.7 : 0.3,
        maxOutputTokens: 4096,
      },
    });

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of response) {
      if (abortSignal?.aborted) {
        callbacks.onDone({ inputTokens, outputTokens });
        return;
      }

      const chunkText = chunk.text;
      if (chunkText) {
        callbacks.onToken(chunkText);
      }

      if (chunk.usageMetadata) {
        inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens;
        outputTokens = chunk.usageMetadata.candidatesTokenCount ?? outputTokens;
      }
    }

    callbacks.onDone({ inputTokens, outputTokens });
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}
