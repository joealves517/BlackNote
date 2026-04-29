import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import {
  createOrUpdateUser,
  deductCreditsByEmail,
  logUsage,
} from "../services/firestore.js";
import { streamWritingAI } from "../services/vertex-ai.js";
import { streamFreeWritingAI } from "../services/gemini-free.js";
import { calculateTokenCost } from "../services/token-cost.js";

const router = Router();

interface AIRequestBody {
  prompt: string;
  option?: string;
  command?: string;
}

/**
 * POST /api/ai
 * Premium endpoint — Vertex AI for writing assistance.
 * If user has credits > 0, use Vertex AI and deduct based on actual token usage.
 * Otherwise, gracefully fallback to free Gemini API.
 */
router.post(
  "/",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const body = req.body as AIRequestBody;

    if (!body.prompt || body.prompt.trim().length < 2) {
      res.status(400).json({ error: "invalid_prompt" });
      return;
    }

    const user = await createOrUpdateUser(authReq.userId, {
      email: authReq.userEmail,
      displayName: authReq.userName,
      picture: authReq.userPicture,
    });

    const option = body.option || "improve";
    const command = body.command;

    // Vercel AI SDK expects plain text streaming
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // Fallback to free API when quota exhausted (same experience as free users)
    if (user.credits <= 0) {
      await streamFreeWritingAI(
        body.prompt,
        option,
        {
          onToken: (token: string) => {
            res.write(token);
          },
          onDone: () => {
            res.end();
          },
          onError: (error: Error) => {
            console.error("[AI] Gemini Free fallback error:", error.message);
            res.write("⚠️ AI is currently busy. Please try again.");
            res.end();
          },
        },
        undefined,
        command
      );
      return;
    }

    // Premium path — deduct based on actual token usage after completion
    await streamWritingAI(
      body.prompt,
      option,
      {
        onToken: (token: string) => {
          res.write(token);
        },
        onDone: (usage?: { inputTokens: number; outputTokens: number }) => {
          res.end();

          const creditsUsed = usage ? calculateTokenCost(usage) : 1;

          deductCreditsByEmail(authReq.userEmail, creditsUsed).catch(console.error);

          logUsage({
            userId: authReq.userId,
            app: "blacknote",
            creditsUsed,
            model: "gemini-2.5-flash",
            timestamp: new Date(),
            ...(usage && { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }),
          }).catch(console.error);
        },
        onError: (error: Error) => {
          console.error("[AI Premium] Vertex AI error:", error.message);
          // No credits deducted on error — fair billing
          res.write("⚠️ AI is currently busy. Please try again.");
          res.end();
        },
      },
      undefined,
      command
    );
  }
);

export default router;
