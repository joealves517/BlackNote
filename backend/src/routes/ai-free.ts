import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { streamFreeWritingAI } from "../services/gemini-free.js";
import { checkFreeCreditLimit, deductFreeCredits } from "../services/firestore.js";

const router = Router();

interface FreeAIRequestBody {
  prompt: string;
  option?: string;
  command?: string;
  history?: { role: string; content: string }[];
  noteContext?: string;
  files?: { mimeType: string; data: string }[];
}

/**
 * POST /api/ai/free
 * Free tier — proxies Gemini API for writing assistance.
 * Requires authentication. Rate limited aggressively.
 *
 * Vercel AI SDK `useCompletion` sends { prompt } in the body.
 * We also accept `option` (improve/fix/shorter/etc.) and `command` for custom prompts.
 */
router.post(
  "/",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const body = req.body as FreeAIRequestBody;

    const option = body.option || "improve";
    const isImageOption = option === "describe_image" || option === "extract_text";

    if (!isImageOption && (!body.prompt || body.prompt.trim().length < 2)) {
      res.status(400).json({ error: "invalid_prompt" });
      return;
    }

    const safePrompt = body.prompt || "Please process this image.";

    const canProceed = await checkFreeCreditLimit(authReq.userEmail);
    if (!canProceed) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.write("You have reached your daily limit for free AI services. Consider upgrading to Pro for unlimited access.");
      res.end();
      return;
    }

    // Vercel AI SDK expects plain text streaming
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const command = body.command;

    await streamFreeWritingAI(
      safePrompt,
      option,
      {
        onToken: (token: string) => {
          res.write(token);
        },
        onDone: () => {
          res.end();
          deductFreeCredits(authReq.userEmail, 2).catch(console.error);
        },
        onError: (error: Error) => {
          console.error("[AI Free] Error:", error.message);
          res.write("We are facing high traffic. Please try again later.");
          res.end();
        },
      },
      undefined,
      command,
      body.history,
      body.noteContext,
      body.files
    );
  }
);

export default router;
