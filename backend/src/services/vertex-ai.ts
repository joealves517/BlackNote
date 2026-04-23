/**
 * Premium Vertex AI Gemini — for paid users with credits.
 * Adapted for BlackNote: AI writing assistant prompts.
 */

import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";

const ai = new GoogleGenAI({
  vertexai: true,
  project: config.gcp.projectId,
  location: config.gcp.region,
});

const MODEL_NAME = "gemini-2.5-flash";

const WRITING_SYSTEM_PROMPT = `You are an expert AI writing assistant embedded in a note-taking editor called BlackNote.
You help users improve, expand, summarize, translate, and fix their writing.

CRITICAL RULES:
- Respond ONLY with the improved/generated text — no meta commentary, no explanations
- Match the user's language and writing style
- Preserve the original formatting (headings, lists, etc.)
- Be concise and natural — the output should feel human-written`;

const OPTION_PROMPTS: Record<string, string> = {
  improve: "Improve this text's clarity, flow, and readability while preserving the original meaning:",
  fix: "Fix all grammar, spelling, and punctuation errors in this text. Return the corrected version only:",
  shorter: "Make this text more concise while keeping all key points. Remove redundancy:",
  longer: "Expand and elaborate on this text. Add relevant details, examples, or explanations:",
  continue: "Continue writing naturally from where this text left off. Match the tone and style:",
  translate: "Translate this text to English. If it's already in English, translate to Vietnamese:",
  zap: "",
};

interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

export async function streamWritingAI(
  text: string,
  option: string,
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal,
  command?: string
): Promise<void> {
  let userPrompt: string;
  if (option === "zap" && command) {
    userPrompt = `${command}\n\n${text}`;
  } else {
    const prefix = OPTION_PROMPTS[option] || OPTION_PROMPTS.improve;
    userPrompt = `${prefix}\n\n${text}`;
  }

  try {
    const response = await ai.models.generateContentStream({
      model: MODEL_NAME,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: WRITING_SYSTEM_PROMPT,
        temperature: 0.3,
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
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}
