import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { createOrUpdateUser, deductCreditsByEmail, logUsage, checkFreeCreditLimit, deductFreeCredits } from "../services/firestore.js";
import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createVertex } from "@ai-sdk/google-vertex";
import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";
import { calculateTokenCost } from "../services/token-cost.js";

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

const PREMIUM_MODEL = "gemini-3.1-flash-lite";

const SYSTEM_PROMPT = `You are an AI writing assistant in BlackNote, a rich-text note editor.
You receive a document where each block starts with a marker like «b0», «b1», etc.
The user gives an instruction to modify the document.

OUTPUT FORMAT — follow exactly:
- Changed block: «bN» followed by the new content
- New block: «new» followed by content
- Delete a block: «bN» [DELETE]
- Update Note Title: «title» followed by the new title text (Use this ONLY if the user asks to rename the note or if you decide to improve the title based on the content).
- Full Rewrite: «replace_all» followed by the entire new document content. (CRITICAL: You MUST use this if the user asks to summarize, translate, rewrite the whole document, 'make it professional', change the global format, or if you are combining many blocks into fewer blocks).

FORMATTING SYNTAX the editor supports (use freely when appropriate):
- Markdown: # headings, **bold**, *italic*, ~~strikethrough~~, ==highlight==, \`inline code\`, \`\`\`code blocks\`\`\`
- Lists: - bullet items, 1. numbered items
- Task lists (Must use exact syntax): - [ ] unchecked task, - [x] checked task (Example: «new» - [ ] Buy milk)
- Blockquote: > text
- Horizontal rule: ---
- Links: [text](url)
- Tables: GFM pipe syntax
- HTML inline: <u>underline</u>, <mark>highlight</mark>, ==highlight==
- Colors (Use span with style): <span style="color: red">red text</span>, <span style="color: #ff0000">hex text</span> (Example: «b0» <span style="color: blue">Blue text</span>)
- Alignment: <p style="text-align: right">text</p>, <div style="text-align: center">text</div>

RULES:
- Return ONLY blocks you changed, added, or deleted. Do NOT return unchanged blocks.
- Be thorough: if the instruction affects a block, include it. Do NOT skip blocks that need changes.
- CRITICAL: If you modify the beginning of the document but ignore the rest, the rest WILL REMAIN on the screen! If a block becomes empty, merged, or irrelevant after your edits, you MUST explicitly delete it using \`«bN» [DELETE]\`. If there are too many blocks to delete manually, use \`«replace_all»\` instead.
- Do NOT include the » character anywhere in your content.
- If the user asks to generate, draw, or create an image/picture, you MUST use the \`generate_image\` tool to create it. Once the tool returns the image URL, output it using Markdown image syntax \`![Description](URL)\` at the correct location.
- Do NOT hallucinate image URLs. Only use the URL returned by the \`generate_image\` tool.
- No explanations, no commentary — output ONLY the block lines.
- If the user asks a general question (not editing), answer normally without block markers.`;

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

    // Estimate tokens to decide routing
    const fullPrompt = `${SYSTEM_PROMPT}\n\nNote Title: ${title || "Untitled"}\n\nDocument Content:\n${safeMarkdown}\n\n---\nInstruction: ${instruction}`;
    const totalInputTokens = Math.ceil(fullPrompt.length / 4);

    const model = vertex(PREMIUM_MODEL);
    const actualModelName = PREMIUM_MODEL;

    const runStream = async (modelToUse: any, modelNameUsed: string, isFallbackAttempt = false) => {
      try {
        const result = streamText({
          model: modelToUse,
          system: SYSTEM_PROMPT,
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
                    return { error: "Failed to generate image. Inform the user." };
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
