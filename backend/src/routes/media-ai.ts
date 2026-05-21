/**
 * BlackNote Media AI Routes — transcribe, summarize, translate, title, keyframes.
 * Ported from AI Screen Recorder with adaptations for BlackNote's note-centric workflow.
 *
 * Free tier: Gemini API key (unlimited usage).
 * Premium tier: Vertex AI with token-based credit deduction.
 */

import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import {
  createOrUpdateUser,
  deductCreditsByEmail,
  logUsage,
  checkFreeCreditLimit,
  deductFreeCredits
} from "../services/firestore.js";
import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";
import { calculateTokenCost } from "../services/token-cost.js";
import { transcribeWithGemini } from "../services/gemini-transcribe.js";
import { PROMPTS } from "../prompts/index.js";

const router = Router();

const vertexAI = new GoogleGenAI({
  vertexai: true,
  project: config.gcp.projectId,
  location: config.gcp.region,
});

const PREMIUM_MODEL = "gemini-2.5-flash-lite";

function pickAIClient(hasPremiumCredits: boolean) {
  return { client: vertexAI, model: PREMIUM_MODEL };
}

function extractTokenCost(response: any): {
  creditsUsed: number;
  inputTokens: number;
  outputTokens: number;
} {
  const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
  const creditsUsed = calculateTokenCost({ inputTokens, outputTokens });
  return { creditsUsed, inputTokens, outputTokens };
}


// ─── Transcribe (audio chunk → timestamped segments via Groq Whisper) ──

router.post(
  "/transcribe",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const { audioBase64, mimeType } = req.body;

    if (!audioBase64) {
      res.status(400).json({ error: "missing_audio" });
      return;
    }

    const user = await createOrUpdateUser(
      authReq.userId,
      {
        email: authReq.userEmail,
        displayName: authReq.userName,
        picture: authReq.userPicture,
      },
      "BlackNote"
    );

    const usePremium = user.credits > 0;
    if (!usePremium) {
      const canProceed = await checkFreeCreditLimit(authReq.userEmail);
      if (!canProceed) {
        res.status(403).json({ error: "You have reached your daily limit for free AI services. Consider upgrading to Pro for unlimited access." });
        return;
      }
    }

    try {
      // Gemini Flash Lite — free/premium, deduct credits based on token cost
      const result = await transcribeWithGemini(
        audioBase64,
        mimeType || "audio/mpeg",
        usePremium
      );

      const creditsUsed = result.usage
        ? calculateTokenCost(result.usage)
        : 5;

      console.log(`[Media AI] Transcribe completed. Cost: ${creditsUsed} credits (tokens: ${JSON.stringify(result.usage)})`);

      if (usePremium) {
        deductCreditsByEmail(authReq.userEmail, creditsUsed).catch(console.error);
      } else {
        deductFreeCredits(authReq.userEmail, creditsUsed).catch(console.error);
      }


      res.json({
        segments: result.segments,
        transcript: result.transcript,
      });
    } catch (error: any) {
      console.error("[Media AI] Transcribe error:", error?.message);
      res.status(500).json({
        error: "We are facing high traffic. Please try again later.",
      });
    }
  }
);

// ─── Summarize ──────────────────────────────────────────────────

// Summarize prompts are now in the Prompt Registry

router.post(
  "/summarize",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const { transcript, style, isVideo } = req.body;

    if (!transcript) {
      res.status(400).json({ error: "missing_transcript" });
      return;
    }

    const user = await createOrUpdateUser(
      authReq.userId,
      {
        email: authReq.userEmail,
        displayName: authReq.userName,
        picture: authReq.userPicture,
      },
      "BlackNote"
    );

    const usePremium = user.credits > 0;
    if (!usePremium) {
      const canProceed = await checkFreeCreditLimit(authReq.userEmail);
      if (!canProceed) {
        res.status(403).json({ error: "You have reached your daily limit for free AI services. Consider upgrading to Pro for unlimited access." });
        return;
      }
    }
    const { client, model } = pickAIClient(usePremium);

    try {
      const prompt = PROMPTS.media.summarize.buildPrompt({
        transcript,
        style: style || "summary",
        isVideo: !!isVideo,
      });

      const response = await client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          systemInstruction: PROMPTS.media.summarize.system,
          temperature: 0.5,
          maxOutputTokens: 2048,
        },
      });

      if (usePremium) {
        const { creditsUsed, inputTokens, outputTokens } =
          extractTokenCost(response);
        deductCreditsByEmail(authReq.userEmail, creditsUsed).catch(
          console.error
        );
        logUsage({
          userId: authReq.userId,
          app: "blacknote",
          creditsUsed,
          model,
          timestamp: new Date(),
          inputTokens,
          outputTokens,
        }).catch(console.error);
      } else {
        const { creditsUsed } = extractTokenCost(response);
        deductFreeCredits(authReq.userEmail, creditsUsed).catch(console.error);
      }

      res.json({ summary: (response.text || "").trim() });
    } catch (error) {
      console.error("[Media AI] Summarize error:", error);
      res.status(500).json({ error: "We are facing high traffic. Please try again later." });
    }
  }
);

// ─── Translate ──────────────────────────────────────────────────

router.post(
  "/translate",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const { segments, targetLang } = req.body;

    if (!segments || !targetLang) {
      res.status(400).json({ error: "missing_params" });
      return;
    }

    const user = await createOrUpdateUser(
      authReq.userId,
      {
        email: authReq.userEmail,
        displayName: authReq.userName,
        picture: authReq.userPicture,
      },
      "BlackNote"
    );

    const usePremium = user.credits > 0;
    if (!usePremium) {
      const canProceed = await checkFreeCreditLimit(authReq.userEmail);
      if (!canProceed) {
        res.status(403).json({ error: "You have reached your daily limit for free AI services. Consider upgrading to Pro for unlimited access." });
        return;
      }
    }
    const { client, model } = pickAIClient(usePremium);

    try {
      const textsPayload = segments.map((s: any, i: number) => ({
        i,
        t: s.text,
      }));

      const response = await client.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: PROMPTS.media.translate.buildPrompt({
                  textsPayload,
                  targetLang,
                }),
              },
            ],
          },
        ],
        config: {
          systemInstruction: PROMPTS.media.translate.system,
          temperature: 0.3,
          maxOutputTokens: 8192,
        },
      });

      const rawText = (response.text || "[]").trim();
      const translatedTexts = parseJSON(rawText);

      const textMap = new Map<number, string>();
      if (Array.isArray(translatedTexts)) {
        translatedTexts.forEach((item: any) => {
          if (typeof item.i === "number" && typeof item.t === "string") {
            textMap.set(item.i, item.t);
          }
        });
      }

      const translatedSegments = segments.map((seg: any, idx: number) => ({
        start: seg.start,
        end: seg.end,
        text: textMap.get(idx) || seg.text,
      }));

      if (usePremium) {
        const { creditsUsed, inputTokens, outputTokens } =
          extractTokenCost(response);
        deductCreditsByEmail(authReq.userEmail, creditsUsed).catch(
          console.error
        );
        logUsage({
          userId: authReq.userId,
          app: "blacknote",
          creditsUsed,
          model,
          timestamp: new Date(),
          inputTokens,
          outputTokens,
        }).catch(console.error);
      } else {
        const { creditsUsed } = extractTokenCost(response);
        deductFreeCredits(authReq.userEmail, creditsUsed).catch(console.error);
      }

      res.json({ translatedSegments });
    } catch (error) {
      console.error("[Media AI] Translate error:", error);
      res.status(500).json({ error: "We are facing high traffic. Please try again later." });
    }
  }
);

// ─── Smart Title ────────────────────────────────────────────────

router.post(
  "/title",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const { transcript } = req.body;

    if (!transcript) {
      res.status(400).json({ error: "missing_transcript" });
      return;
    }

    const user = await createOrUpdateUser(
      authReq.userId,
      {
        email: authReq.userEmail,
        displayName: authReq.userName,
        picture: authReq.userPicture,
      },
      "BlackNote"
    );

    const usePremium = user.credits > 0;
    if (!usePremium) {
      const canProceed = await checkFreeCreditLimit(authReq.userEmail);
      if (!canProceed) {
        res.status(403).json({ error: "You have reached your daily limit for free AI services. Consider upgrading to Pro for unlimited access." });
        return;
      }
    }
    const { client, model } = pickAIClient(usePremium);

    try {
      const response = await client.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: PROMPTS.media.title.buildPrompt({ transcript }),
              },
            ],
          },
        ],
        config: {
          systemInstruction: PROMPTS.media.title.system,
          temperature: 0.6,
          maxOutputTokens: 256,
        },
      });

      const rawText = (response.text || "{}").trim();
      const result = parseJSON(rawText);

      if (usePremium) {
        const { creditsUsed, inputTokens, outputTokens } =
          extractTokenCost(response);
        deductCreditsByEmail(authReq.userEmail, creditsUsed).catch(
          console.error
        );
        logUsage({
          userId: authReq.userId,
          app: "blacknote",
          creditsUsed,
          model,
          timestamp: new Date(),
          inputTokens,
          outputTokens,
        }).catch(console.error);
      } else {
        const { creditsUsed } = extractTokenCost(response);
        deductFreeCredits(authReq.userEmail, creditsUsed).catch(console.error);
      }

      res.json({
        title: result.title || "Untitled Recording",
        description: result.description || "",
        tags: Array.isArray(result.tags) ? result.tags : [],
      });
    } catch (error) {
      console.error("[Media AI] Title error:", error);
      res.status(500).json({ error: "We are facing high traffic. Please try again later." });
    }
  }
);

// ─── Keyframe Timestamps (AI picks important moments) ───────────

router.post(
  "/keyframes",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const { transcript, durationSec, maxFrames } = req.body;

    if (!transcript || !durationSec) {
      res.status(400).json({ error: "missing_params" });
      return;
    }

    const user = await createOrUpdateUser(
      authReq.userId,
      {
        email: authReq.userEmail,
        displayName: authReq.userName,
        picture: authReq.userPicture,
      },
      "BlackNote"
    );

    const usePremium = user.credits > 0;
    if (!usePremium) {
      const canProceed = await checkFreeCreditLimit(authReq.userEmail);
      if (!canProceed) {
        res.status(403).json({ error: "You have reached your daily limit for free AI services. Consider upgrading to Pro for unlimited access." });
        return;
      }
    }
    const { client, model } = pickAIClient(usePremium);

    try {
      const frameCount = Math.min(maxFrames || 6, 10);

      const response = await client.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: PROMPTS.media.keyframe.buildPrompt({
                  transcript,
                  durationSec,
                  frameCount,
                }),
              },
            ],
          },
        ],
        config: {
          systemInstruction: PROMPTS.media.keyframe.system,
          temperature: 0.4,
          maxOutputTokens: 1024,
        },
      });

      const rawText = (response.text || "[]").trim();
      const parsed = parseJSON(rawText);
      const timestamps = Array.isArray(parsed)
        ? parsed
            .filter(
              (f: any) =>
                typeof f.time === "number" && typeof f.label === "string"
            )
            .map((f: any) => ({
              time: Math.max(0, Math.min(f.time, durationSec)),
              label: f.label.slice(0, 80),
            }))
        : [];

      if (usePremium) {
        const { creditsUsed, inputTokens, outputTokens } =
          extractTokenCost(response);
        deductCreditsByEmail(authReq.userEmail, creditsUsed).catch(
          console.error
        );
        logUsage({
          userId: authReq.userId,
          app: "blacknote",
          creditsUsed,
          model,
          timestamp: new Date(),
          inputTokens,
          outputTokens,
        }).catch(console.error);
      } else {
        const { creditsUsed } = extractTokenCost(response);
        deductFreeCredits(authReq.userEmail, creditsUsed).catch(console.error);
      }

      res.json({ timestamps });
    } catch (error) {
      console.error("[Media AI] Keyframes error:", error);
      res.status(500).json({ error: "We are facing high traffic. Please try again later." });
    }
  }
);

// ─── Helpers ────────────────────────────────────────────────────

function parseSegments(
  rawText: string
): Array<{ start: number; end: number; text: string }> {
  const cleaned = stripMarkdownFences(rawText);
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s: any) =>
          s && typeof s.text === "string" && s.text.trim().length > 0
      )
      .map((s: any) => ({
        start: typeof s.start === "number" ? Math.max(0, s.start) : 0,
        end: typeof s.end === "number" ? Math.max(0, s.end) : 0,
        text: s.text.trim(),
      }));
  } catch {
    return [];
  }
}

function parseJSON(rawText: string): any {
  const cleaned = stripMarkdownFences(rawText);
  try {
    return JSON.parse(cleaned);
  } catch {
    return {};
  }
}

function stripMarkdownFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  return cleaned.trim();
}

export default router;
