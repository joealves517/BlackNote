import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { createOrUpdateUser, deductCreditsByEmail, logUsage } from "../services/firestore.js";
import { streamText, tool } from "ai";
import { createVertex } from "@ai-sdk/google-vertex";
import { config } from "../config/index.js";
import { z } from "zod";

const router = Router();

// Create Google Vertex provider instance
const vertex = createVertex({
  project: config.gcp.projectId,
  location: config.gcp.region,
});

const MODEL_NAME = "gemini-2.5-flash";

const SYSTEM_PROMPT = `You are a powerful, autonomous AI Agent embedded within a rich-text editor (BlackNote).
Your job is to read the user's prompt and use your provided tools to directly modify the editor's content or formatting.

RULES:
- When the user asks to format, style, or color text, use the 'applyFormatting' tool.
- When the user asks to rewrite, translate, or fix spelling, use the 'replaceText' tool.
- When the user asks to add new content like a table, checklist, or summary, use the 'insertBlocks' tool.
- Always try to figure out what they want to do based on their prompt.
- Do NOT output conversational filler like "Sure, I will do that". Just call the tools!
- If the user asks a general question, you may answer normally. But prefer using tools if the request implies editor manipulation.`;

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

    // Retrieve user quota (in a real app we'd deduct here or after stream)
    const user = await createOrUpdateUser(authReq.userId, {
      email: authReq.userEmail,
      displayName: authReq.userName,
      picture: authReq.userPicture,
    }, "BlackNote");

    // if (user.credits <= 0) {
    //   res.status(402).json({ error: "Insufficient credits for AI Agent." });
    //   return;
    // }

    try {
      const result = streamText({
        model: vertex(MODEL_NAME),
        system: `${SYSTEM_PROMPT}\n\n--- CURRENT DOCUMENT CONTENT ---\n${documentContext || "Document is empty."}\n--- END DOCUMENT ---`,
        messages: messages,
        // @ts-ignore - The Vercel SDK version typings for tool differ but runtime expects parameters
        tools: {
          applyFormatting: tool({
            description: "Applies styles like color, bold, italics, or headings to the entire document or a specific section if requested.",
            inputSchema: z.object({
              color: z.string().optional().describe("A valid CSS color name or hex code (e.g. 'pink', '#ff0000'). Use 'default' to remove color."),
              bold: z.boolean().optional().describe("Set to true to make text bold."),
              italic: z.boolean().optional().describe("Set to true to make text italic."),
              align: z.enum(["left", "center", "right"]).optional().describe("Text alignment"),
            }),
          }),
          replaceText: tool({
            description: "Replaces the entire document content with new text (e.g. after rewriting, translating, or fixing grammar).",
            inputSchema: z.object({
              newContent: z.string().describe("The new Markdown content to replace the old content."),
            }),
          }),
          insertBlocks: tool({
            description: "Inserts new text or blocks (like markdown lists, tables) at the end of the document.",
            inputSchema: z.object({
              content: z.string().describe("The Markdown content to insert."),
            }),
          })
        }
      });

      // Stream the response directly to the client using Vercel AI SDK Data Stream protocol
      // @ts-ignore - The Vercel SDK version we installed might have different response methods
      result.pipeUIMessageStreamToResponse(res);
      
    } catch (err) {
      console.error("[Agent AI] Error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
