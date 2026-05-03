import { Router, Request, Response } from "express";
import { streamFreeWritingAI } from "../services/gemini-free.js";

const router = Router();

interface FreeAIRequestBody {
  prompt: string;
  option?: string;
  command?: string;
}

/**
 * POST /api/ai/free
 * Free tier — proxies Gemini API for writing assistance.
 * No authentication required. Rate limited aggressively.
 *
 * Vercel AI SDK `useCompletion` sends { prompt } in the body.
 * We also accept `option` (improve/fix/shorter/etc.) and `command` for custom prompts.
 */
router.post(
  "/",
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as FreeAIRequestBody;

    if (!body.prompt || body.prompt.trim().length < 2) {
      res.status(400).json({ error: "invalid_prompt" });
      return;
    }

    // Vercel AI SDK expects plain text streaming
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const option = body.option || "improve";
    const command = body.command;

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
          console.error("[AI Free] Gemini error:", error.message);
          res.write("⚠️ The Free AI server is temporarily busy (rate limited). Please wait 30 seconds before trying again.");
          res.end();
        },
      },
      undefined,
      command
    );
  }
);

export default router;
