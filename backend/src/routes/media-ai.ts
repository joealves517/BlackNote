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
import { transcribeWithGroq } from "../services/groq-queue.js";

const router = Router();

const vertexAI = new GoogleGenAI({
  vertexai: true,
  project: config.gcp.projectId,
  location: config.gcp.region,
});

const freeAI = new GoogleGenAI({
  apiKey: "AIzaSyCO3F6Znpad9_cZo6nQyVq18kSeXjjti8Y",
});

const PREMIUM_MODEL = "gemini-2.5-flash";
const FREE_MODEL = "gemini-2.5-flash-lite";

function pickAIClient(hasPremiumCredits: boolean) {
  return hasPremiumCredits
    ? { client: vertexAI, model: PREMIUM_MODEL }
    : { client: freeAI, model: FREE_MODEL };
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
      // Groq Whisper — free, deduct fixed amount for free users
      const result = await transcribeWithGroq(
        audioBase64,
        mimeType || "audio/mpeg"
      );

      if (!usePremium) {
        deductFreeCredits(authReq.userEmail, 5).catch(console.error);
      }


      res.json({
        segments: result.segments,
        transcript: result.transcript,
      });
    } catch (error: any) {
      console.error("[Media AI] Transcribe error:", error?.message);
      const isRateLimit = error?.status === 429;
      res.status(isRateLimit ? 429 : 500).json({
        error: isRateLimit ? "rate_limited" : "transcription_failed",
      });
    }
  }
);

// ─── Summarize ──────────────────────────────────────────────────

const SUMMARIZE_PROMPTS: Record<string, (transcript: string) => string> = {
  meeting_minutes: (t) =>
    `Generate professional Meeting Minutes from this recording transcript. Include:\n- Meeting Goal / Context\n- Key Discussion Points\n- Decisions Made\n- Action Items (as Markdown checkboxes "- [ ]")\n\n${t}`,
  summary: (t) =>
    `Summarize the following recording transcript concisely in 2-4 paragraphs. Capture all important points:\n\n${t}`,
  keypoints: (t) =>
    `Extract the key points from this recording transcript as a bullet-point list. Each point should be a concise, actionable insight:\n\n${t}`,
  action_items: (t) =>
    `Extract all action items, tasks, and to-dos from this recording transcript. Format as a Markdown checklist using "- [ ] task". Group by topic if applicable:\n\n${t}`,
  chapters: (t) =>
    `Generate smart chapters for this recording transcript. Format as a bulleted list with timestamps and clear, catchy titles for each section:\n\n${t}`,
  social: (t) =>
    `Repurpose this recording transcript into an engaging, professional social media post. Include a catchy hook, main takeaways, and relevant hashtags:\n\n${t}`,
  quiz: (t) =>
    `Based on this recording transcript, generate a short interactive quiz with 3 multiple choice questions. Provide the questions first, then list the correct answers at the end:\n\n${t}`,
};

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
      const promptFn =
        SUMMARIZE_PROMPTS[style || "summary"] || SUMMARIZE_PROMPTS.summary;
      let prompt = promptFn(transcript);

      if (isVideo) {
        prompt += `\n\nCRITICAL INSTRUCTION: Since this is a video recording, try to explicitly mention visual details if they are described in the transcript.`;
      }

      const response = await client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          systemInstruction:
            "You are a concise content analyzer for a note-taking app. Create clear, well-structured, and actionable summaries. Respond in the same language as the transcript.",
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
      res.status(500).json({ error: "summarization_failed" });
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
                text: `Translate each "t" field to ${targetLang}. Keep the "i" index unchanged.
Return ONLY a valid JSON array of objects with "i" and "t" fields.
No markdown, no commentary.

${JSON.stringify(textsPayload)}`,
              },
            ],
          },
        ],
        config: {
          systemInstruction:
            "You are a professional translator. Output only the JSON array.",
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
      res.status(500).json({ error: "translation_failed" });
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
      const contextText = transcript.slice(0, 5000);

      const response = await client.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Based on the following recording transcript, generate:
1. A concise, descriptive title (max 60 characters)
2. A brief description (max 200 characters)
3. 3-5 relevant tags

Transcript:
${contextText}

Respond in this exact JSON format:
{"title": "...", "description": "...", "tags": ["...", "..."]}`,
              },
            ],
          },
        ],
        config: {
          systemInstruction:
            "You are a content metadata specialist. Generate clear, SEO-friendly titles. Always respond in valid JSON format. Respond in the same language as the transcript.",
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
      res.status(500).json({ error: "title_generation_failed" });
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
                text: `You are analyzing a video recording that is ${Number(durationSec).toFixed(1)} seconds long.

Given the transcript below, identify the ${frameCount} most visually important or meaningful moments. These should be moments where:
- A new topic or section begins
- Important information is being shown/discussed
- A visual change or demonstration happens
- Key conclusions or results are presented

Return ONLY a JSON array of objects with:
- "time": timestamp in seconds (float, between 0 and ${Number(durationSec).toFixed(1)})
- "label": brief description of why this moment is important (max 15 words)

Spread the timestamps across the full duration. Return exactly ${frameCount} items.
No markdown, no commentary, just the JSON array.

Transcript:
${transcript.slice(0, 8000)}`,
              },
            ],
          },
        ],
        config: {
          systemInstruction:
            "You are a video analysis expert. Select visually meaningful timestamps. Output only valid JSON.",
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
      res.status(500).json({ error: "keyframe_selection_failed" });
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
