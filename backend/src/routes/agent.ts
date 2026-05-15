import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { createOrUpdateUser, deductCreditsByEmail, logUsage } from "../services/firestore.js";
import { streamText } from "ai";
import { createVertex } from "@ai-sdk/google-vertex";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { config } from "../config/index.js";
import { calculateTokenCost } from "../services/token-cost.js";

const router = Router();

// Premium: Vertex AI (project-bound, token-billed)
const vertex = createVertex({
  project: config.gcp.projectId,
  location: config.gcp.region,
});

// Free: Gemini API key (fallback for large context)
const freeGemini = createGoogleGenerativeAI({
  apiKey: config.gemini.apiKey,
});

// Free: Groq API (primary for fast, free text)
const groq = createGroq({
  apiKey: config.groq.apiKey || process.env.GROQ_API_KEY || "dummy_key",
});

const PREMIUM_MODEL = "gemini-2.5-flash";
const FALLBACK_FREE_MODEL = "gemini-3.1-flash-lite";
const GROQ_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen/qwen3-32b",
  "openai/gpt-oss-120b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant"
];
const GROQ_TOKEN_LIMIT = 6000;

const SYSTEM_PROMPT = `You are an AI writing assistant in BlackNote, a rich-text note editor.
You receive a document where each block starts with a marker like «b0», «b1», etc.
The user gives an instruction to modify the document.

OUTPUT FORMAT — follow exactly:
- Changed block: «bN» followed by the new content
- New block: «new» followed by content
- Delete a block: «bN» [DELETE]

FORMATTING SYNTAX the editor supports (use freely when appropriate):
- Markdown: # headings, **bold**, *italic*, ~~strikethrough~~, \`inline code\`, \`\`\`code blocks\`\`\`
- Lists: - bullet items, 1. numbered items
- Task lists (Must use exact syntax): - [ ] unchecked task, - [x] checked task (Example: «new» - [ ] Buy milk)
- Blockquote: > text
- Horizontal rule: ---
- Links: [text](url)
- Tables: GFM pipe syntax
- HTML inline: <u>underline</u>, <mark>highlight</mark>
- Colors (Use span with style): <span style="color: red">red text</span>, <span style="color: #ff0000">hex text</span> (Example: «b0» <span style="color: blue">Blue text</span>)

RULES:
- Return ONLY blocks you changed, added, or deleted. Do NOT return unchanged blocks.
- Be thorough: if the instruction affects a block, include it. Do NOT skip blocks that need changes.
- If a block becomes empty or irrelevant after your edits, explicitly delete it with [DELETE].
- Do NOT include the » character anywhere in your content.
- No explanations, no commentary — output ONLY the block lines.
- If the user asks a general question (not editing), answer normally without block markers.`;

router.post(
  "/",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const { markdown, instruction } = req.body;

    if (!instruction?.trim()) {
      res.status(400).json({ error: "Missing instruction" });
      return;
    }

    // Allow empty markdown for empty documents
    const safeMarkdown = markdown || "(Document is empty)";

    const user = await createOrUpdateUser(authReq.userId, {
      email: authReq.userEmail,
      displayName: authReq.userName,
      picture: authReq.userPicture,
    }, "BlackNote");

    const isPro = user.credits > 0;

    // Estimate tokens to decide routing
    const fullPrompt = `${SYSTEM_PROMPT}\n\n${safeMarkdown}\n\n---\nInstruction: ${instruction}`;
    const totalInputTokens = Math.ceil(fullPrompt.length / 4);

    let model;
    let actualModelName = PREMIUM_MODEL;

    if (isPro) {
      model = vertex(PREMIUM_MODEL);
    } else if (totalInputTokens > GROQ_TOKEN_LIMIT) {
      model = freeGemini(FALLBACK_FREE_MODEL);
      actualModelName = FALLBACK_FREE_MODEL;
      console.log(`[Agent Free] Tokens ${totalInputTokens} > limit, routing to Gemini`);
    } else {
      const groqModelName = GROQ_MODELS[Math.floor(Math.random() * GROQ_MODELS.length)];
      model = groq(groqModelName);
      actualModelName = groqModelName;
      console.log(`[Agent Free] Routing to Groq: ${groqModelName}`);
    }

    // Plain text streaming headers
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    try {
      const result = streamText({
        model,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: `${safeMarkdown}\n\n---\nInstruction: ${instruction}` },
        ],
        onFinish: ({ usage }) => {
          if (usage) {
            const creditsUsed = isPro ? calculateTokenCost({
              inputTokens: usage.inputTokens || 0,
              outputTokens: usage.outputTokens || 0,
            }) : 0;

            if (isPro) {
              deductCreditsByEmail(authReq.userEmail, creditsUsed).catch(console.error);
            }

            logUsage({
              userId: authReq.userId,
              app: "blacknote",
              action: "agent",
              creditsUsed,
              model: actualModelName,
              timestamp: new Date(),
              inputTokens: usage.inputTokens || 0,
              outputTokens: usage.outputTokens || 0,
            }).catch(console.error);
          }
        },
      });

      for await (const chunk of result.textStream) {
        res.write(chunk);
      }
      res.end();
    } catch (err) {
      console.error("[Agent AI] Error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      } else {
        res.end();
      }
    }
  }
);

export default router;
