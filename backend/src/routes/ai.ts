import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import {
  createOrUpdateUser,
  deductCreditsByEmail,
  addCreditsByEmail,
  logUsage,
} from "../services/firestore.js";
import { streamWritingAI } from "../services/vertex-ai.js";
import { streamFreeWritingAI } from "../services/gemini-free.js";

const router = Router();

interface AIRequestBody {
  prompt: string;
  option?: string;
  command?: string;
}

/**
 * POST /api/ai
 * Premium endpoint — Vertex AI for writing assistance.
 * Requires authentication + credits > 0.
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

    // Ensure user exists in Firestore (shared with Ask This Page)
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

    // Fallback to FREE AI if no credits
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

    // Deduct 1 credit atomically
    const deducted = await deductCreditsByEmail(authReq.userEmail, 1);
    if (!deducted) {
      res.status(402).json({ error: "insufficient_credits" });
      return;
    }



    await streamWritingAI(
      body.prompt,
      option,
      {
        onToken: (token: string) => {
          res.write(token);
        },
        onDone: () => {
          res.end();

          // Fire-and-forget: log usage internally
          logUsage({
            userId: authReq.userId,
            app: "blacknote",
            creditsUsed: 1,
            model: "gemini-2.5-flash",
            timestamp: new Date(),
          }).catch(console.error);
        },
        onError: (error: Error) => {
          console.error("[AI Premium] Vertex AI error:", error.message);

          // Refund credit on failure
          addCreditsByEmail(authReq.userEmail, 1).catch(console.error);

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
