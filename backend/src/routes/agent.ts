import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { createOrUpdateUser, deductCreditsByEmail, logUsage } from "../services/firestore.js";
import { streamText, tool } from "ai";
import { createVertex } from "@ai-sdk/google-vertex";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { config } from "../config/index.js";
import { calculateTokenCost } from "../services/token-cost.js";
import { z } from "zod";

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

const SYSTEM_PROMPT = `You are a powerful, autonomous AI Agent embedded within a rich-text editor (BlackNote).
Your job is to read the user's prompt and use your provided tools to directly modify the editor's content.

DOCUMENT FORMAT:
- The document is presented as numbered blocks: [Block 0], [Block 1], [Block 2], etc.
- Each block is a single line of content (a heading, a paragraph, a bullet item, etc.).
- Blocks marked [empty] contain no text — they are empty lines or empty list items.

RULES:
- When the user asks to edit, rewrite, translate, or improve content, identify the EXACT block(s) that need changing.
- Call 'replaceBlock' ONCE PER BLOCK. If 3 blocks need changing, make 3 separate replaceBlock calls.
- ONLY modify blocks that match the user's request. Leave all other blocks untouched.
- To DELETE a block (e.g. remove empty lines or duplicate bullets), call replaceBlock with an empty string "" as newContent.
- The 'newContent' SHOULD use Markdown if the user asks for structure. You CAN generate Todo Lists using '- [ ] Task', Tables using '| Col |', Blockquotes using '> text', and Headings.
- When the user asks to add new content at the end, use the 'insertBlocks' tool.
- When the user asks to format or style text, use the 'applyFormatting' tool.
- Do NOT output conversational filler. Just call the tools directly.
- If the user asks a general question, you may answer normally.`;

// Shared tool definitions for both free and premium paths
const agentTools = {
  applyFormatting: tool({
    description: "Applies styles like color, bold, italics, or text alignment to the entire document text.",
    inputSchema: z.object({
      color: z.string().optional().describe("A valid CSS color name or hex code (e.g. 'pink', '#ff0000'). Use 'default' to remove color."),
      bold: z.boolean().optional().describe("Set to true to make text bold."),
      italic: z.boolean().optional().describe("Set to true to make text italic."),
      align: z.enum(["left", "center", "right"]).optional().describe("Text alignment direction."),
    }),
  }),
  replaceBlock: tool({
    description: "Replaces a specific block of text in the document. Use this when the user asks to edit, rewrite, delete, or translate specific content.",
    inputSchema: z.object({
      blockIndex: z.number().describe("The integer ID of the block to replace (e.g., 0, 1, 2) based on the provided document context."),
      newContent: z.string().describe("The new Markdown content for this block. Send an empty string '' to completely delete the block."),
    }),
  }),
  insertBlocks: tool({
    description: "Inserts new text or blocks (like markdown lists, tables) below the current selection.",
    inputSchema: z.object({
      content: z.string().describe("The Markdown content to insert."),
    }),
  }),
};

router.post(
  "/",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const body = req.body;

    const { messages, documentContext } = body;

    if (!messages) {
      res.status(400).json({ error: "Missing messages" });
      return;
    }

    const user = await createOrUpdateUser(authReq.userId, {
      email: authReq.userEmail,
      displayName: authReq.userName,
      picture: authReq.userPicture,
    }, "BlackNote");

    const isPro = user.credits > 0;
    
    // Estimate tokens to decide routing
    const contextString = `${SYSTEM_PROMPT}\n\n--- CURRENT DOCUMENT CONTENT ---\n${documentContext || "Document is empty."}\n--- END DOCUMENT ---`;
    const messageString = JSON.stringify(messages);
    const totalInputTokens = Math.ceil((contextString.length + messageString.length) / 4);

    let model;
    let actualModelName = PREMIUM_MODEL;

    if (isPro) {
      model = vertex(PREMIUM_MODEL);
    } else if (totalInputTokens > GROQ_TOKEN_LIMIT) {
      model = freeGemini(FALLBACK_FREE_MODEL);
      actualModelName = FALLBACK_FREE_MODEL;
      console.log(`[Agent Free] Tokens ${totalInputTokens} > limit, routing to Gemini`);
    } else {
      // Randomly rotate Groq models
      const groqModelName = GROQ_MODELS[Math.floor(Math.random() * GROQ_MODELS.length)];
      model = groq(groqModelName);
      actualModelName = groqModelName;
      console.log(`[Agent Free] Routing to Groq: ${groqModelName}`);
    }

    try {
      const result = streamText({
        model,
        system: contextString,
        messages,
        // @ts-ignore - The Vercel SDK version typings for tool differ but runtime expects parameters
        tools: agentTools,
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

      // @ts-ignore - The Vercel SDK version we installed might have different response methods
      result.pipeUIMessageStreamToResponse(res);
    } catch (err) {
      console.error("[Agent AI] Error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
