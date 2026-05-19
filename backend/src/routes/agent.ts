import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { createOrUpdateUser, deductCreditsByEmail, logUsage, checkFreeCreditLimit, deductFreeCredits } from "../services/firestore.js";
import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createVertex } from "@ai-sdk/google-vertex";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
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

// Premium: Vertex AI (project-bound, token-billed)
const vertex = createVertex({
  project: config.gcp.projectId,
  location: config.gcp.region,
});

// Free: Gemini API key (fallback for large context)
const freeGemini = createGoogleGenerativeAI({
  apiKey: config.gemini.apiKey,
});

// Free: Groq API (primary for fast, free text)
const groq = createGroq({
  apiKey: config.groq.apiKey || process.env.GROQ_API_KEY || "dummy_key",
});

const PREMIUM_MODEL = "gemini-3.1-flash-lite";
const FALLBACK_FREE_MODEL = "gemini-3.1-flash-lite";
const GROQ_MODELS = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen/qwen3-32b",
  "openai/gpt-oss-120b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant"
];
const GROQ_TOKEN_LIMIT = 6000;

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
        res.write("⚠️ You have reached your daily limit for free AI services. Consider upgrading to Pro for unlimited access.");
        res.end();
        return;
      }
    }

    // Estimate tokens to decide routing
    const fullPrompt = `${SYSTEM_PROMPT}\n\nNote Title: ${title || "Untitled"}\n\nDocument Content:\n${safeMarkdown}\n\n---\nInstruction: ${instruction}`;
    const totalInputTokens = Math.ceil(fullPrompt.length / 4);

    let model;
    let actualModelName = PREMIUM_MODEL;

    if (isPro) {
      model = vertex(PREMIUM_MODEL);
    } else if (totalInputTokens > GROQ_TOKEN_LIMIT) {
      model = freeGemini(FALLBACK_FREE_MODEL);
      actualModelName = FALLBACK_FREE_MODEL;
      console.log(`[Agent Free] Tokens ${totalInputTokens} > limit, routing to Gemini`);
    } else {
      const groqModelName = GROQ_MODELS[Math.floor(Math.random() * GROQ_MODELS.length)];
      model = groq(groqModelName);
      actualModelName = groqModelName;
      console.log(`[Agent Free] Routing to Groq: ${groqModelName}`);
    }

    // Plain text streaming headers
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    try {
      const result = streamText({
        model,
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
                
                const apiKeys = [
                  config.gemini.apiKey,
                  "AIzaSyCO3F6Znpad9_cZo6nQyVq18kSeXjjti8Y"
                ].filter(Boolean);

                let res: globalThis.Response | null = null;
                let lastErrText = "";

                for (const key of apiKeys) {
                  res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${key}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      contents: [{ parts: [{ text: prompt }] }],
                      generationConfig: { responseModalities: ["IMAGE"] }
                    })
                  });

                  if (res.ok) {
                    break;
                  } else {
                    lastErrText = await res.text();
                    console.warn(`[Agent Tool] Image generation failed with key ${key.slice(0,10)}...:`, lastErrText);
                  }
                }

                if (!res || !res.ok) {
                  console.error("[Agent Tool] Image generation failed on all keys:", lastErrText);
                  return { error: "Failed to generate image. Inform the user." };
                }

                const data = await res.json() as any;
                const base64Data = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                
                if (!base64Data) {
                  return { error: "No image data returned from model." };
                }

                const buffer = Buffer.from(base64Data, 'base64');
                const key = `agent-images/${authReq.userId.replace(/[^a-zA-Z0-9]/g, "_")}/${Date.now()}.jpeg`;

                await s3.send(new PutObjectCommand({
                  Bucket: BUCKET,
                  Key: key,
                  Body: buffer,
                  ContentType: "image/jpeg",
                  CacheControl: "public, max-age=31536000, immutable"
                }));

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
              model: actualModelName,
              timestamp: new Date(),
              inputTokens: usage.inputTokens || 0,
              outputTokens: usage.outputTokens || 0,
            }).catch(console.error);
          }
        },
      });

      for await (const chunk of result.textStream) {
        res.write(chunk);
      }
      res.end();
    } catch (err) {
      console.error("[Agent AI] Error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      } else {
        res.end();
      }
    }
  }
);

export default router;
