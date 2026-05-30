import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import {
  createOrUpdateUser,
  deductCreditsByEmail,
  logUsage,
  checkFreeCreditLimit,
  deductFreeCredits,
  addCreditsByEmail
} from "../services/firestore.js";
import { calculateTokenCost } from "../services/token-cost.js";
import { GoogleGenAI, Type } from "@google/genai";
import { config } from "../config/index.js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const router = Router();

// ─── S3 & Imagen Client Setup ─────────────────────────────────────
const s3 = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});
const BUCKET = config.aws.s3Bucket;
const S3_PUBLIC_URL = `https://${BUCKET}.s3.${config.aws.region}.amazonaws.com`;

const ai = new GoogleGenAI({
  vertexai: true,
  project: config.gcp.projectId,
  location: config.gcp.region,
});

// ─── Types ────────────────────────────────────────────────────────
interface FrontendChange {
  blockId: string;
  content: string;
}

// ─── System Instructions & Tool Definitions ────────────────────────
const AGENT_INSTRUCTION = `CRITICAL: You MUST immediately process the user's request on the FIRST turn. NEVER respond with greetings, acknowledgements, or "I am ready" messages. Execute the request NOW.

You are BlackNote AI — a premium, high-aesthetic writing assistant embedded in a rich-text note editor.
The user sends you their note content (blocks marked as «b0», «b1», «b2» etc.) and a request.

## How to Respond

**If the user wants to MODIFY the document** (edit, translate, rewrite, add, delete, format):
→ Call the appropriate tool(s) immediately. Do NOT explain what you will do — just DO it.
  - Edit a specific block → replaceBlock(blockId, newText)
  - Rewrite the ENTIRE document (translate all, restructure) → replaceBlock(blockId="replace_all", newText="full new content")
  - Add content at the beginning (prepend summary/text) → insertBlock(text, position="beginning")
  - Add content at the end (append text) → insertBlock(text, position="end")
  - Insert new block after a specific block (e.g., b2) → insertBlock(text, position="after", referenceBlockId="b2")
  - Insert new block before a specific block (e.g., b0) → insertBlock(text, position="before", referenceBlockId="b0")
  - Delete a block → deleteBlock(blockId)
  - Change note title → updateTitle(newTitle)
  - Generate image → generate_image(prompt)

**If the user asks a QUESTION** (explain, analyze, review, discuss):
→ Answer directly in plain text. Use Markdown formatting.

## Content Formatting & Styling Guide (MUST USE to make notes visually stunning!)

You have full support for advanced typography, styling, and structural elements in the rich-text editor. Use them strategically to make notes highly readable, premium, and professional.

### 1. Typography & Hierarchy
- **Headings**: Use \`# Heading 1\`, \`## Heading 2\`, \`### Heading 3\` to structure the document. Never use Heading 4 or lower.
- **Bold & Italic**: Use \`**bold**\` (or \`<b>text</b>\`) for emphasis and key terms, and \`*italic*\` (or \`<i>text</i>\`) for secondary emphasis or citations.
- **Underline**: Use HTML \`<u>text</u>\` to underline important definitions or headings.
- **Strikethrough**: Use \`~~text~~\` (or \`<s>text</s>\`) for deleted or resolved tasks/items.

### 2. Layout & Alignment (Very Premium)
You can align text using inline HTML style \`style="text-align: ..."\` on headings and paragraphs:
- **Center**: \`<p style="text-align: center">Centered text</p>\` or \`<h2 style="text-align: center">Centered Heading</h2>\` (great for titles, premium quotes, or separators).
- **Right**: \`<p style="text-align: right">Right-aligned text</p>\` (great for signatures, dates, or metadata).
- **Justify**: \`<p style="text-align: justify">Justified paragraph...</p>\` (perfect for long, professional multi-line paragraphs).
- **Left (Default)**: Standard text alignment.

### 3. Vibrant Colors & Highlights (Eye-Catching)
Apply rich, harmonic colors to make key details stand out (avoid plain primary colors):
- **Text Color**: Use HTML \`<span style="color: #HEX_CODE">text</span>\`.
  - *Red/Coral*: \`<span style="color: #ef4444">Important / Alert</span>\`
  - *Blue/Aqua*: \`<span style="color: #3b82f6">Key Concept / Info</span>\`
  - *Green/Emerald*: \`<span style="color: #10b981">Success / Done / Positive</span>\`
  - *Orange/Amber*: \`<span style="color: #f59e0b">Warning / Important Note</span>\`
  - *Purple/Violet*: \`<span style="color: #8b5cf6">Creative / Special Term</span>\`
- **Highlight (Background marker)**: Use \`==text==\` or HTML \`<mark>text</mark>\` for standard yellow highlights.
  - For premium custom colored highlights: \`<mark style="background-color: #fef08a">yellow highlight</mark>\` or \`<mark style="background-color: #bfdbfe">blue highlight</mark>\`.

### 4. Advanced Structure & Data Layout
- **Tables**: Use standard Markdown tables for structured data or comparison lists:
  | Feature | Description | Status |
  | :--- | :--- | :--- |
  | **Premium** | Sleek UI, AI assistant | \`<span style="color: #10b981">Active</span>\` |
  | **Standard** | Basic text editing | \`<span style="color: #f59e0b">Free</span>\` |
- **Lists & Checklists**:
  - Unordered list: \`- bullet item\`
  - Ordered list: \`1. numbered item\`
  - Interactive checklists (Tasks): \`- [ ] uncompleted task\` and \`- [x] completed task\`. Use these when the user asks to list actions, plans, or TODOs.
- **Blockquotes**: Use \`> text\` to highlight key quotes, summaries, or citations. It will render like a premium card.
- **Code Snippets**: Use inline \\\`code\\\` or fenced block \\\`\\\`\\\`lang\\ncode\\n\\\`\\\`\\\` for syntax highlighting.
- **Dividers**: Use \`---\` on a new line to create clean thematic breaks between sections.

## Rules
- Reply in the SAME LANGUAGE as the user
- Do NOT include « or » characters in content you write
- You CAN call multiple tools (e.g., updateTitle + replaceBlock together)`;

const tools: any[] = [
  {
    functionDeclarations: [
      {
        name: "replaceBlock",
        description: "Replace the content of a specific block in the document. Pass blockId='replace_all' ONLY to rewrite the entire note.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            blockId: { type: Type.STRING, description: "The ID of the block to replace (e.g., b0, b1) or 'replace_all'" },
            newText: { type: Type.STRING, description: "The new markdown content for this block" },
          },
          required: ["blockId", "newText"],
        },
      },
      {
        name: "insertBlock",
        description: "Insert new markdown content at a specific position relative to the document or other blocks.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING, description: "The markdown content to insert" },
            position: { 
              type: Type.STRING, 
              description: "Where to insert: 'beginning' (prepend at top), 'end' (append at bottom), 'before' (insert before referenceBlockId), 'after' (insert after referenceBlockId)",
              enum: ["beginning", "end", "before", "after"]
            },
            referenceBlockId: { 
              type: Type.STRING, 
              description: "The block ID to reference (e.g. b0, b1) when using 'before' or 'after' position" 
            }
          },
          required: ["text", "position"],
        },
      },
      {
        name: "deleteBlock",
        description: "Delete a specific block from the document entirely",
        parameters: {
          type: Type.OBJECT,
          properties: {
            blockId: { type: Type.STRING, description: "The ID of the block to delete (e.g., b0, b1)" },
          },
          required: ["blockId"],
        },
      },
      {
        name: "updateTitle",
        description: "Update the title of the note/document",
        parameters: {
          type: Type.OBJECT,
          properties: {
            newTitle: { type: Type.STRING, description: "The new title for the document" },
          },
          required: ["newTitle"],
        },
      },
      {
        name: "generate_image",
        description: "Generate a premium visual image based on a prompt. Use this ONLY when the user explicitly asks for an image, drawing, or picture.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            prompt: { type: Type.STRING, description: "A highly detailed description of the image to generate in English." },
          },
          required: ["prompt"],
        },
      },
    ],
  },
];

// ─── Premium Image Generation helper ────────────────────────────────
async function executeGenerateImage(
  prompt: string,
  userId: string,
  userEmail: string,
  isPro: boolean
): Promise<string> {
  const imageCreditsCost = 30; // 30 credits = $0.03
  let balanceDeducted = false;

  try {
    console.log(`[Agent Tool] Pre-billing check for user: ${userEmail}`);

    if (isPro) {
      balanceDeducted = await deductCreditsByEmail(userEmail, imageCreditsCost);
      if (!balanceDeducted) {
        throw new Error("Failed to generate image. Please check your account balance or upgrade to Pro to continue.");
      }
    } else {
      const canProceed = await checkFreeCreditLimit(userEmail);
      if (!canProceed) {
        throw new Error("Failed to generate image. Daily limit reached. Please upgrade to Pro to generate images.");
      }
      await deductFreeCredits(userEmail, imageCreditsCost);
      balanceDeducted = true;
    }

    console.log(`[Agent Tool] Calling Vertex Imagen 3...`);
    const apiResponse = await ai.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt: prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: "image/jpeg",
      },
    });

    const base64Image = apiResponse.generatedImages?.[0]?.image?.imageBytes;
    if (!base64Image) {
      throw new Error("No imageBytes returned from Vertex Imagen");
    }

    console.log(`[Agent Tool] Uploading base64 image to AWS S3...`);
    const safeUserId = userId.replace(/[^a-zA-Z0-9]/g, "_");
    const key = `agent-images/${safeUserId}/${Date.now()}.jpeg`;
    const uploadParams = {
      Bucket: BUCKET,
      Key: key,
      Body: Buffer.from(base64Image, "base64"),
      ContentType: "image/jpeg",
    };

    await s3.send(new PutObjectCommand(uploadParams));
    const publicUrl = `${S3_PUBLIC_URL}/${key}`;
    console.log(`[Agent Tool] Image upload complete: ${publicUrl}`);

    logUsage({
      userId,
      app: "blacknote",
      action: "imagen_generate",
      creditsUsed: imageCreditsCost,
      model: "imagen-3.0-generate-002",
      timestamp: new Date(),
    }).catch(console.error);

    return publicUrl;
  } catch (err: any) {
    console.error("[Agent Tool] Error in generate_image tool:", err);

    if (balanceDeducted) {
      if (isPro) {
        await addCreditsByEmail(userEmail, imageCreditsCost).catch(console.error);
      } else {
        await deductFreeCredits(userEmail, -imageCreditsCost).catch(console.error);
      }
      console.log(`[Agent Tool] Refunded ${imageCreditsCost} credits to ${userEmail} due to error`);
    }

    throw err;
  }
}

// ─── Route Handler ────────────────────────────────────────────────
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

    const safeMarkdown = markdown || "(Document is empty)";

    // 1. Fetch/Sync user record
    const user = await createOrUpdateUser(
      authReq.userId,
      {
        email: authReq.userEmail,
        displayName: authReq.userName,
        picture: authReq.userPicture,
      },
      "BlackNote"
    );

    const isPro = user.credits > 0;

    // 2. Enforce credits or free usage limit
    if (!isPro) {
      const canProceed = await checkFreeCreditLimit(authReq.userEmail);
      if (!canProceed) {
        res.status(429).json({
          error: "You have reached your daily limit for free AI services. Consider upgrading to Pro for unlimited access.",
        });
        return;
      }
    }

    try {
      // 3. Build the user message with document context
      const userMessageText = `USER REQUEST: ${instruction}

--- DOCUMENT CONTEXT ---
Note Title: ${title || "Untitled"}

Document Content:
${safeMarkdown}
--- END DOCUMENT ---`;

      console.log("[Agent Route] Dispatching prompt to Gemini...");

      // 4. Call Gemini using official @google/genai SDK
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: [
          {
            role: "user",
            parts: [{ text: userMessageText }],
          },
        ],
        config: {
          systemInstruction: AGENT_INSTRUCTION,
          tools: tools,
        },
      });

      const parts = response.candidates?.[0]?.content?.parts || [];
      const changes: FrontendChange[] = [];
      let imageUrl: string | undefined;
      let textResponse = "";

      // 5. Parse function call results and text responses directly
      for (const part of parts) {
        if (part.functionCall) {
          const { name, args } = part.functionCall as { name: string; args: any };
          console.log(`[Agent Route] Function call requested: ${name}`, args);

          switch (name) {
            case "replaceBlock":
              changes.push({
                blockId: (args.blockId || "b0").replace(/[«»]/g, ""),
                content: args.newText || "",
              });
              break;
            case "insertBlock": {
              const position = args.position || "end";
              const cleanRefId = args.referenceBlockId ? args.referenceBlockId.replace(/[«»]/g, "") : "";
              
              if (position === "beginning") {
                changes.push({
                  blockId: "prepend",
                  content: args.text || "",
                });
              } else if (position === "end") {
                changes.push({
                  blockId: "new",
                  content: args.text || "",
                });
              } else if (position === "before" && cleanRefId) {
                changes.push({
                  blockId: `insert_before:${cleanRefId}`,
                  content: args.text || "",
                });
              } else if (position === "after" && cleanRefId) {
                changes.push({
                  blockId: `insert_after:${cleanRefId}`,
                  content: args.text || "",
                });
              } else {
                changes.push({
                  blockId: "new",
                  content: args.text || "",
                });
              }
              break;
            }
            case "deleteBlock":
              changes.push({
                blockId: (args.blockId || "b0").replace(/[«»]/g, ""),
                content: "[DELETE]",
              });
              break;
            case "updateTitle":
              changes.push({
                blockId: "title",
                content: args.newTitle || "",
              });
              break;
            case "generate_image":
              if (args.prompt) {
                try {
                  const generatedUrl = await executeGenerateImage(
                    args.prompt,
                    authReq.userId,
                    authReq.userEmail,
                    isPro
                  );
                  imageUrl = generatedUrl;
                  changes.push({
                    blockId: "new",
                    content: `![Generated Image](${generatedUrl})`,
                  });
                } catch (imgErr: any) {
                  textResponse += `\nFailed to generate image: ${imgErr.message || imgErr}`;
                }
              }
              break;
          }
        }

        if (part.text) {
          textResponse += part.text;
        }
      }

      console.log(`[Agent Route] Completed. Changes: ${changes.length}, Text Response length: ${textResponse.length}`);

      // 6. Build response payload
      let responsePayload: Record<string, unknown>;

      if (changes.length > 0) {
        responsePayload = { changes };
        if (imageUrl) {
          responsePayload.imageUrl = imageUrl;
        }
      } else if (textResponse.trim()) {
        responsePayload = { text: textResponse };
      } else {
        responsePayload = { text: "I processed your request, but no content changes were made." };
      }

      res.json(responsePayload);

      // 7. Background billing
      (async () => {
        try {
          const inputTokens = response.usageMetadata?.promptTokenCount || Math.ceil(userMessageText.length / 4);
          const outputTokens = response.usageMetadata?.candidatesTokenCount || Math.ceil((textResponse.length + JSON.stringify(changes).length) / 4);
          const creditsUsed = calculateTokenCost({ inputTokens, outputTokens });

          if (isPro) {
            await deductCreditsByEmail(authReq.userEmail, creditsUsed);
          } else {
            await deductFreeCredits(authReq.userEmail, creditsUsed);
          }

          await logUsage({
            userId: authReq.userId,
            app: "blacknote",
            action: "agent",
            creditsUsed,
            model: "gemini-2.5-flash-lite",
            timestamp: new Date(),
            inputTokens,
            outputTokens,
          });
        } catch (logErr) {
          console.error("[Agent Route] Logging usage failed:", logErr);
        }
      })();
    } catch (err: any) {
      console.error("[Agent Route] Execution failed:", err);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Failed to execute agent. Please try again later.",
        });
      }
    }
  }
);

export default router;
