/**
 * Free Tier AI Service
 * Uses Groq API as primary for fast, free text generation with Model Rotation.
 * Fallbacks to Gemini API for large contexts or multimodal requests.
 */

import { GoogleGenAI } from "@google/genai";
import { Groq } from "groq-sdk";
import { config } from "../config/index.js";

// --- Clients ---
const gemini = new GoogleGenAI({
  apiKey: "AIzaSyCO3F6Znpad9_cZo6nQyVq18kSeXjjti8Y",
});

const groq = new Groq({
  apiKey: config.groq.apiKey || process.env.GROQ_API_KEY,
});

// --- Constants ---
const GEMINI_MODEL = "gemini-3.1-flash-lite";

// Groq Model Rotation List (Ordered by preference)
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "mixtral-8x7b-32768",
  "llama-3.1-8b-instant"
];

// Token limit threshold for Groq (approx 6000 words/tokens to be safe)
const GROQ_TOKEN_LIMIT = 6000;

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
  todo: "Extract tasks, action items, and to-dos from this text. Ensure the output is formatted as a strict Markdown checklist using '- [ ] task':",
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
  extract_todo: `Extract actionable tasks and to-dos from this content.

RULES:
- First line MUST be: # Short Title (max 6 words)
- Output MUST be a strict Markdown checklist using '- [ ] ' for each task
- Group tasks logically if there are many (using ## headings)
- Do not add conversational filler:`,
  describe_image: `You are an expert AI vision assistant. Describe this image concisely in ONE short sentence. Focus on the main subject, context, and any prominent text.`,
  extract_text: `You are an OCR and structural extraction AI. Extract all text and structure from this image.
RULES:
- Preserve headings, paragraphs, lists, and tables.
- Return ONLY the extracted Markdown text, no conversational filler.`,
};

// Helper to estimate tokens (1 token ≈ 4 characters)
function estimateTokenCount(text: string): number {
  return Math.ceil((text?.length || 0) / 4);
}

// Ensure error matches EXACTLY what user requested
function handleAiError(error: any, callbacks: StreamCallbacks) {
  console.error("[AI Free] Error:", error?.message || error);
  // Throw specific message to upsell
  callbacks.onError(new Error("We are facing high traffic, consider upgrading to PRO to enjoy the best experience."));
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

  // 1. Build prompt string to calculate length
  let userPrompt: string;
  if (option === "chat") {
    userPrompt = text;
  } else if (option === "zap" && command) {
    userPrompt = `${command}\n\n${text}`;
  } else if (option === "import_file") {
    userPrompt = "Read the attached file and convert its entire content into a well-formatted Markdown note. Preserve all headings, lists, and important data. Do not add any conversational filler:\n\n" + text;
  } else {
    const prefix = OPTION_PROMPTS[option] || OPTION_PROMPTS.improve;
    userPrompt = `${prefix}\n\n${text}`;
  }

  let sysInstruction = WRITING_SYSTEM_PROMPT;
  if (option === "chat") {
    sysInstruction = `You are a helpful AI assistant embedded in a note-taking app called BlackNote.
You are chatting with the user. Answer their questions clearly and concisely.
Use Markdown formatting where appropriate (bold, lists, code blocks).
If the user asks about the note, refer to the Note Content below.

STRICT RULE: The note may contain MEDIA TRANSCRIPT sections. You MUST use them to answer questions about recordings. However, NEVER quote or regurgitate the raw transcript text in your response. Always summarize the information naturally in your own words. DO NOT use blockquotes for transcript content.

--- NOTE CONTENT START ---
${noteContext || "The note is currently empty."}
--- NOTE CONTENT END ---`;
  }

  // 2. Token Estimation
  let totalInputTokens = estimateTokenCount(sysInstruction) + estimateTokenCount(userPrompt);
  if (noteContext) totalInputTokens += estimateTokenCount(noteContext);
  if (history) {
    history.forEach(h => totalInputTokens += estimateTokenCount(h.content));
  }

  const hasFiles = files && files.length > 0;

  // 3. Routing Logic
  if (option === "describe_image" || option === "extract_text") {
    console.log(`[AI Free] Routing to Groq Vision`);
    return streamGroqVision(userPrompt, sysInstruction, callbacks, abortSignal, files);
  } else if (totalInputTokens > GROQ_TOKEN_LIMIT || hasFiles) {
    // Route to Gemini (Large Context or fallback for files not handled by Groq Vision)
    console.log(`[AI Free] Routing to Gemini (Tokens: ${totalInputTokens}, Files: ${hasFiles})`);
    return streamGemini(userPrompt, option, sysInstruction, callbacks, abortSignal, history, files);
  } else {
    // Route to Groq (Fast, Free, Text-only)
    console.log(`[AI Free] Routing to Groq (Tokens: ${totalInputTokens})`);
    return streamGroq(userPrompt, sysInstruction, callbacks, abortSignal, history);
  }
}

async function streamGroqVision(
  userPrompt: string,
  sysInstruction: string,
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal,
  files?: { mimeType: string; data: string }[]
) {
  try {
    const contentPayload: any[] = [{ type: "text", text: userPrompt }];

    if (files && files.length > 0) {
      files.forEach(file => {
        contentPayload.push({
          type: "image_url",
          image_url: { url: `data:${file.mimeType};base64,${file.data}` }
        });
      });
    }

    const messages: any[] = [
      { role: "system", content: sysInstruction },
      { role: "user", content: contentPayload }
    ];

    console.log(`[Groq Vision] Using meta-llama/llama-4-scout-17b-16e-instruct`);
    const stream = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: messages,
      temperature: 0.2,
      max_tokens: 2048,
      stream: true,
    });

    for await (const chunk of stream) {
      if (abortSignal?.aborted) {
        callbacks.onDone();
        return;
      }
      const token = chunk.choices[0]?.delta?.content || "";
      if (token) {
        callbacks.onToken(token);
      }
    }
    callbacks.onDone();
  } catch (error: any) {
    console.warn(`[Groq Vision] Failed:`, error?.message);
    return handleAiError(error, callbacks);
  }
}

async function streamGroq(
  userPrompt: string,
  sysInstruction: string,
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal,
  history?: { role: string; content: string }[]
) {
  const messages: any[] = [{ role: "system", content: sysInstruction }];

  if (history && history.length > 0) {
    history.forEach(msg => {
      if (!msg.content) return;
      messages.push({
        role: msg.role === "ai" || msg.role === "assistant" ? "assistant" : "user",
        content: msg.content
      });
    });
  }

  messages.push({ role: "user", content: userPrompt });

  // Model Rotation Loop
  for (let i = 0; i < GROQ_MODELS.length; i++) {
    const model = GROQ_MODELS[i];
    try {
      console.log(`[Groq] Trying model: ${model}`);
      const stream = await groq.chat.completions.create({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: true,
      });

      for await (const chunk of stream) {
        if (abortSignal?.aborted) {
          callbacks.onDone();
          return;
        }
        const token = chunk.choices[0]?.delta?.content || "";
        if (token) {
          callbacks.onToken(token);
        }
      }
      callbacks.onDone();
      return; // Success! Exit the function.

    } catch (error: any) {
      console.warn(`[Groq] Model ${model} failed:`, error?.message);
      // If it's the last model in the list, we fail completely.
      if (i === GROQ_MODELS.length - 1) {
        return handleAiError(error, callbacks);
      }
      // Otherwise, loop continues to the next model.
    }
  }
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
    const response = await gemini.models.generateContentStream({
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
