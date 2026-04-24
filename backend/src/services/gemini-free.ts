/**
 * Gemini Free Tier — uses Google AI Studio API key (not Vertex AI).
 * Adapted for BlackNote: AI writing assistant prompts.
 */

import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";

const ai = new GoogleGenAI({
  apiKey: "AIzaSyCO3F6Znpad9_cZo6nQyVq18kSeXjjti8Y",
});

const MODEL_NAME = "gemini-flash-lite-latest"; // Native Gemini model name

interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

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
  clean_page: `You are a content editor. Clean and restructure this raw web page content into a well-formatted note.

RULES:
- First line MUST be a short title: # Title (max 6 words, capture the core topic)
- Organize content with clear headings (##, ###)
- Remove ALL noise: badges, navigation text, ads, tracking links, repeated content
- Keep only the core article/documentation content
- Preserve important links as [text](url) format
- Keep code examples in fenced code blocks
- Remove badge images and decorative images
- Use bullet points for lists
- Output clean, readable Markdown only — no commentary:`,
  summarize_page: `Summarize this page content concisely.

RULES:
- First line MUST be: # Short Title (max 6 words, capture the essence)
- Use ## for 3-5 main sections
- Each section: 1-2 bullet points max
- Include key data, numbers, or quotes if any
- Total length: under 300 words
- No filler text, be direct:`,
  mindmap: `Create a visual mindmap from this content using nested Markdown lists.

RULES:
- First line MUST be: # Short Title (max 6 words)
- Use a TREE STRUCTURE with nested bullet points (indentation = depth)
- Top level: main topic branches (use **bold** for branch names)
- Each branch: 2-4 sub-items indented under it
- Sub-items can have their own children (indent deeper)
- Use emoji at the start of each top branch for visual distinction
- NO headings (##) — use ONLY nested bullet lists
- Keep each item to one short line
- Example structure:
  - 🎯 **Main Branch**
    - Sub-topic
      - Detail
    - Sub-topic
  - 🔧 **Another Branch**
    - Sub-topic

Content to map:`,
  extract_key_points: `Extract the most important facts from this content.

RULES:
- First line MUST be: # Short Title (max 6 words)
- Format as a numbered list (1. 2. 3. etc.)
- Each point: one clear, factual sentence
- Max 10 points, prioritize unique insights
- Include specific data, numbers, names when available
- No opinions, only verifiable facts:`,
};

export async function streamFreeWritingAI(
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
