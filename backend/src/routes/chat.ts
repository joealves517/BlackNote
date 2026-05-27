/**
 * POST /api/chat
 *
 * UIMessageStream-compatible endpoint for assistant-ui.
 * Uses Vercel AI SDK `streamText` → `toUIMessageStreamResponse()`.
 */

import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import {
  createOrUpdateUser,
  deductCreditsByEmail,
  logUsage,
  checkFreeCreditLimit,
  deductFreeCredits,
} from "../services/firestore.js";
import { createVertex } from "@ai-sdk/google-vertex";
import { streamText, UIMessage, convertToModelMessages, jsonSchema, tool, stepCountIs } from "ai";
import { calculateTokenCost } from "../services/token-cost.js";
import { PROMPTS } from "../prompts/index.js";
import { config } from "../config/index.js";

const router = Router();

// Vertex AI via @ai-sdk/google-vertex (uses Application Default Credentials on Cloud Run)
const vertex = createVertex({
  project: config.gcp.projectId,
  location: config.gcp.region,
});

const MODEL_ID = "gemini-2.5-flash-lite";

interface ChatRequestBody {
  messages: UIMessage[];
  noteContext?: {
    noteId: string;
    noteTitle: string;
    noteContent: string;
  };
  pageContext?: {
    title: string;
    url: string;
    favicon: string;
    markdown: string;
  } | null;
}

router.post(
  "/",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const body = req.body as ChatRequestBody;

    if (!body.messages || body.messages.length === 0) {
      res.status(400).json({ error: "missing_messages" });
      return;
    }

    const user = await createOrUpdateUser(authReq.userId, {
      email: authReq.userEmail,
      displayName: authReq.userName,
      picture: authReq.userPicture,
    }, "BlackNote");

    const noteCtx = body.noteContext;
    const pageCtx = body.pageContext;

    // Agentic System Prompt
    let systemPrompt = `You are a helpful and intelligent AI assistant embedded in a note-taking app called BlackNote.
You are chatting with the user as an independent assistant.
You have tools to automatically access the user's current context. DO NOT ask the user for their note content or which note they want to read.

When the user asks you to read, summarize, or interact with their note, you MUST invoke the \`read_current_note\` tool to fetch its content automatically.
When the user asks about an attached webpage, you MUST invoke the \`read_current_page\` tool to read its contents automatically.
For general knowledge, use the \`google_search\` tool.

CRITICAL REQUIREMENT FOR TOOL CALLS:
Before you invoke any tool, you MUST output a short conversational sentence explaining what you are doing (e.g., "Let me check your note to find out.").
After outputting this sentence, you MUST immediately invoke the tool in the same response. NEVER ask the user to provide the content themselves.

Answer questions clearly and concisely. Use Markdown formatting.`;

    // Determine if user has credits (premium) or needs free tier
    const hasPremium = user.credits > 0;

    if (!hasPremium) {
      const canProceed = await checkFreeCreditLimit(authReq.userEmail);
      if (!canProceed) {
        res.status(429).json({
          error: "daily_limit_exceeded",
          message: "You have reached your daily limit. Upgrade to Pro for unlimited access.",
        });
        return;
      }
    }

    try {
      // Convert UIMessage[] → ModelMessage[] for streamText
      const modelMessages = await convertToModelMessages(body.messages);

      const result = streamText({
        model: vertex(MODEL_ID),
        system: systemPrompt,
        messages: modelMessages,
        temperature: 0.7,
        maxOutputTokens: 4096,
        stopWhen: stepCountIs(5),
        tools: {
          read_current_note: tool({
            description: 'Read the contents of the note the user is currently looking at.',
            inputSchema: jsonSchema({
              type: 'object' as const,
              properties: {},
            }),
            execute: async () => {
              if (!noteCtx || !noteCtx.noteContent) {
                return "The current note is empty or no note is open.";
              }
              return `Title: ${noteCtx.noteTitle}\n\nContent:\n${noteCtx.noteContent}`;
            }
          }),
          read_current_page: tool({
            description: 'Read the content of the webpage the user has attached to this conversation.',
            inputSchema: jsonSchema({
              type: 'object' as const,
              properties: {},
            }),
            execute: async () => {
              if (!pageCtx || !pageCtx.markdown) {
                return "No webpage is currently attached.";
              }
              return `Webpage Title: ${pageCtx.title}\nURL: ${pageCtx.url}\n\nContent:\n${pageCtx.markdown}`;
            }
          }),
        },
        onFinish: async ({ usage }) => {
          try {
            const inputTokens = usage.inputTokens ?? 0;
            const outputTokens = usage.outputTokens ?? 0;

            if (hasPremium) {
              const creditsUsed = calculateTokenCost({ inputTokens, outputTokens });
              await deductCreditsByEmail(authReq.userEmail, creditsUsed);
              await logUsage({
                userId: authReq.userId,
                app: "blacknote",
                creditsUsed,
                model: MODEL_ID,
                timestamp: new Date(),
                inputTokens,
                outputTokens,
              });
            } else {
              await deductFreeCredits(authReq.userEmail, 2);
            }
          } catch (err) {
            console.error("[Chat] Post-stream billing error:", err);
          }
        },
      });

      // toUIMessageStreamResponse() returns a Web API Response synchronously
      const streamResponse = result.toUIMessageStreamResponse();

      // Forward status & headers from Web Response to Express response
      res.status(streamResponse.status);
      streamResponse.headers.forEach((value: string, key: string) => {
        res.setHeader(key, value);
      });

      // Pipe ReadableStream body to Express res
      const reader = streamResponse.body?.getReader();
      if (!reader) {
        res.status(500).json({ error: "stream_unavailable" });
        return;
      }

      const pump = async (): Promise<void> => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            return;
          }
          res.write(value);
        }
      };

      pump().catch((err) => {
        console.error("[Chat] Stream pump error:", err);
        res.end();
      });
    } catch (error) {
      console.error("[Chat] streamText error:", error);
      res.status(500).json({ error: "ai_error", message: "Failed to generate response" });
    }
  }
);

export default router;
