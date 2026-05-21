import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { createOrUpdateUser, deductCreditsByEmail, logUsage, checkFreeCreditLimit, deductFreeCredits, addCreditsByEmail } from "../services/firestore.js";
import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createVertex } from "@ai-sdk/google-vertex";
import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";
import { calculateTokenCost } from "../services/token-cost.js";
import { PROMPTS } from "../prompts/index.js";
import { routeInstruction, getModeGuidance } from "../agents/router.js";
import { detectAmbiguity } from "../agents/clarification.js";

const s3 = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});
const BUCKET = config.aws.s3Bucket;
const S3_PUBLIC_URL = `https://${BUCKET}.s3.${config.aws.region}.amazonaws.com`;

const router = Router();

// Vertex AI (project-bound, token-billed)
const vertex = createVertex({
  project: config.gcp.projectId,
  location: config.gcp.region,
});

// Vertex AI SDK Client for Imagen
const vertexAI = new GoogleGenAI({
  vertexai: true,
  project: config.gcp.projectId,
  location: config.gcp.region,
});

const PREMIUM_MODEL = "gemini-2.5-flash-lite";

const SYSTEM_PROMPT = PROMPTS.agent.system;

router.post(
  "/",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthenticatedRequest;
    const { markdown, instruction, title } = req.body;

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

    if (!isPro) {
      const canProceed = await checkFreeCreditLimit(authReq.userEmail);
      if (!canProceed) {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.write("You have reached your daily limit for free AI services. Consider upgrading to Pro for unlimited access.");
        res.end();
        return;
      }
    }

    // Classify instruction → agent mode (Factor 10: Small Focused Agents)
    const documentIsEmpty = !markdown || markdown.trim().length === 0;
    const blockCount = (markdown || "").split(/«b\d+»/).length - 1;
    const route = routeInstruction(instruction, documentIsEmpty);

    // Pre-LLM gate: check for ambiguity (Factor 11: Human-in-the-Loop)
    const clarification = detectAmbiguity(instruction, documentIsEmpty, blockCount);
    if (clarification.needed) {
      console.log(`[Agent] Clarification needed: ${clarification.reason}`);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      const clarifyResponse = `«clarify»${JSON.stringify({
        reason: clarification.reason,
        suggestions: clarification.suggestions,
      })}`;
      res.write(clarifyResponse);
      res.end();
      return;
    }

    const modeGuidance = getModeGuidance(route.mode);
    const enhancedSystemPrompt = `${modeGuidance}\n\n${SYSTEM_PROMPT}`;

    console.log(`[Agent] Mode: ${route.mode} | Temp: ${route.temperature} | MaxTokens: ${route.maxOutputTokens}`);

    // Estimate tokens to decide routing
    const fullPrompt = `${enhancedSystemPrompt}\n\nNote Title: ${title || "Untitled"}\n\nDocument Content:\n${safeMarkdown}\n\n---\nInstruction: ${instruction}`;
    const totalInputTokens = Math.ceil(fullPrompt.length / 4);

    const model = vertex(PREMIUM_MODEL);
    const actualModelName = PREMIUM_MODEL;

    const runStream = async (modelToUse: any, modelNameUsed: string, isFallbackAttempt = false) => {
      try {
        const result = streamText({
          model: modelToUse,
          system: enhancedSystemPrompt,
          stopWhen: stepCountIs(3),
          tools: {
            generate_image: tool<{ prompt: string }, any>({
              description: "Generate an image based on a prompt. Use this ONLY when the user explicitly asks for an image, drawing, or picture.",
              inputSchema: z.object({
                prompt: z.string().describe("A highly detailed description of the image to generate in English."),
              }) as any,
              execute: async ({ prompt }) => {
                try {
                  console.log(`[Agent Tool] Generating image for prompt: ${prompt}`);

                  const imageCreditsCost = 30; // 30 credits = $0.03
                  let balanceDeducted = false;

                  // 1. Pre-billing check & deduction
                  if (isPro) {
                    balanceDeducted = await deductCreditsByEmail(authReq.userEmail, imageCreditsCost);
                    if (!balanceDeducted) {
                      console.error(`[Agent Tool] Insufficient credits for Pro user: ${authReq.userEmail}`);
                      return { error: "Failed to generate image. Please check your account balance or upgrade to Pro to continue." };
                    }
                  } else {
                    const canProceed = await checkFreeCreditLimit(authReq.userEmail);
                    if (!canProceed) {
                      console.error(`[Agent Tool] Free credit limit reached for user: ${authReq.userEmail}`);
                      return { error: "Failed to generate image. Daily limit reached. Please upgrade to Pro to generate images." };
                    }
                    await deductFreeCredits(authReq.userEmail, imageCreditsCost);
                    balanceDeducted = true;
                  }
                  
                  const apiResponse = await vertexAI.models.generateImages({
                    model: "imagen-3.0-generate-002",
                    prompt: prompt,
                    config: {
                      numberOfImages: 1,
                      outputMimeType: "image/jpeg",
                    },
                  });

                  const base64Image = apiResponse.generatedImages?.[0]?.image?.imageBytes;
                  if (!base64Image) {
                    console.error("[Agent Tool] Image generation failed: No imageBytes returned");
                    // 2. Safe Auto-Refund upon failures
                    if (balanceDeducted) {
                      if (isPro) {
                        await addCreditsByEmail(authReq.userEmail, imageCreditsCost);
                      } else {
                        await deductFreeCredits(authReq.userEmail, -imageCreditsCost);
                      }
                      console.log(`[Agent Tool] Refunded ${imageCreditsCost} credits to ${authReq.userEmail} due to generation error`);
                    }
                    return { error: "Failed to generate image due to a temporary API error. Please try again." };
                  }
                  
                  const key = `agent-images/${authReq.userId.replace(/[^a-zA-Z0-9]/g, "_")}/${Date.now()}.jpeg`;
                  const uploadParams = {
                    Bucket: BUCKET,
                    Key: key,
                    Body: Buffer.from(base64Image, "base64"),
                    ContentType: "image/jpeg",
                  };
                  
                  await s3.send(new PutObjectCommand(uploadParams));
                  const publicUrl = `${S3_PUBLIC_URL}/${key}`;
                  console.log(`[Agent Tool] Image uploaded to S3: ${publicUrl}`);

                  // 3. Log usage
                  logUsage({
                    userId: authReq.userId,
                    app: "blacknote",
                    action: "imagen_generate",
                    creditsUsed: imageCreditsCost,
                    model: "imagen-3.0-generate-002",
                    timestamp: new Date(),
                  }).catch(console.error);

                  return { url: publicUrl };
                } catch (err: any) {
                  console.error("[Agent Tool] Error in generate_image tool:", err);
                  return { error: err.message };
                }
              }
            })
          },
          messages: [
            { role: "user", content: `${safeMarkdown}\n\n---\nInstruction: ${instruction}` },
          ],
          onFinish: ({ usage }) => {
            if (usage) {
              const creditsUsed = calculateTokenCost({
                inputTokens: usage.inputTokens || 0,
                outputTokens: usage.outputTokens || 0,
              });

              if (isPro) {
                deductCreditsByEmail(authReq.userEmail, creditsUsed).catch(console.error);
              } else {
                deductFreeCredits(authReq.userEmail, creditsUsed).catch(console.error);
              }

              logUsage({
                userId: authReq.userId,
                app: "blacknote",
                action: "agent",
                creditsUsed,
                model: modelNameUsed,
                timestamp: new Date(),
                inputTokens: usage.inputTokens || 0,
                outputTokens: usage.outputTokens || 0,
              }).catch(console.error);
            }
          },
        });

        const reader = result.textStream[Symbol.asyncIterator]();
        const firstChunk = await reader.next();

        if (!res.headersSent) {
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");
          res.setHeader("X-Accel-Buffering", "no");
        }

        if (!firstChunk.done && firstChunk.value) {
          res.write(firstChunk.value);
        }

        let nextChunk = await reader.next();
        while (!nextChunk.done) {
          res.write(nextChunk.value);
          nextChunk = await reader.next();
        }
        res.end();
      } catch (err: any) {
        console.error(`[Agent AI] Error using model ${modelNameUsed}:`, err?.message || err);
        


        if (!res.headersSent) {
          res.status(500).write("We are facing high traffic. Please try again later.");
          res.end();
        } else {
          res.write("\nWe are facing high traffic. Please try again later.");
          res.end();
        }
      }
    };

    await runStream(model, actualModelName);
  }
);

export default router;
