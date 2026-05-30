import { FunctionTool } from "@google/adk";
import { z } from "zod";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { GoogleGenAI } from "@google/genai";
import { config } from "../config/index.js";
import {
  deductCreditsByEmail,
  addCreditsByEmail,
  deductFreeCredits,
  checkFreeCreditLimit,
  logUsage
} from "../services/firestore.js";

// --- S3 & Imagen Client Setup ---
const s3 = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});
const BUCKET = config.aws.s3Bucket;
const S3_PUBLIC_URL = `https://${BUCKET}.s3.${config.aws.region}.amazonaws.com`;

const vertexAI = new GoogleGenAI({
  vertexai: true,
  project: config.gcp.projectId,
  location: config.gcp.region,
});

// --- Editor Mutation Tools ---

export const insertContentTool = new FunctionTool({
  name: "insertContent",
  description: "Insert new markdown content at the end of the document",
  parameters: z.object({
    text: z.string().describe("The markdown content to insert"),
  }) as any,
  execute: (async ({ text }: any) => {
    return { type: "insert", text };
  }) as any,
}) as any;

export const replaceBlockTool = new FunctionTool({
  name: "replaceBlock",
  description: "Replace the content of a specific block in the document",
  parameters: z.object({
    blockId: z.string().describe("The ID of the block to replace (e.g., b0, b1)"),
    newText: z.string().describe("The new markdown content for this block"),
  }) as any,
  execute: (async ({ blockId, newText }: any) => {
    const cleanId = blockId.replace(/[«»]/g, "");
    return { type: "replace", blockId: cleanId, newText };
  }) as any,
}) as any;

export const deleteBlockTool = new FunctionTool({
  name: "deleteBlock",
  description: "Delete a specific block from the document entirely",
  parameters: z.object({
    blockId: z.string().describe("The ID of the block to delete (e.g., b0, b1)"),
  }) as any,
  execute: (async ({ blockId }: any) => {
    const cleanId = blockId.replace(/[«»]/g, "");
    return { type: "delete", blockId: cleanId };
  }) as any,
}) as any;

export const updateTitleTool = new FunctionTool({
  name: "updateTitle",
  description: "Update the title of the note/document",
  parameters: z.object({
    newTitle: z.string().describe("The new title for the document"),
  }) as any,
  execute: (async ({ newTitle }: any) => {
    return { type: "title", newTitle };
  }) as any,
}) as any;

// --- Premium Image Generation Tool ---
// User context (email, userId, isPro) is injected per-request via module-level setter.
// This avoids forcing the model to hallucinate auth fields.

let _userCtx = { email: "", userId: "", isPro: false };

/** Called by the route handler before each agent run to inject user context. */
export function setImageToolUserContext(ctx: { email: string; userId: string; isPro: boolean }) {
  _userCtx = ctx;
}

export const generateImageTool = new FunctionTool({
  name: "generate_image",
  description: "Generate a premium visual image based on a prompt. Use this ONLY when the user explicitly asks for an image, drawing, or picture.",
  parameters: z.object({
    prompt: z.string().describe("A highly detailed description of the image to generate in English."),
  }) as any,
  execute: (async ({ prompt }: any) => {
    const { email: userEmail, userId, isPro } = _userCtx;
    const imageCreditsCost = 30; // 30 credits = $0.03
    let balanceDeducted = false;

    try {
      console.log(`[ADK Tool] Pre-billing check for user: ${userEmail}`);

      if (isPro) {
        balanceDeducted = await deductCreditsByEmail(userEmail, imageCreditsCost);
        if (!balanceDeducted) {
          return { error: "Failed to generate image. Please check your account balance or upgrade to Pro to continue." };
        }
      } else {
        const canProceed = await checkFreeCreditLimit(userEmail);
        if (!canProceed) {
          return { error: "Failed to generate image. Daily limit reached. Please upgrade to Pro to generate images." };
        }
        await deductFreeCredits(userEmail, imageCreditsCost);
        balanceDeducted = true;
      }

      console.log(`[ADK Tool] Calling Vertex Imagen 3...`);
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
        throw new Error("No imageBytes returned from Vertex Imagen");
      }

      console.log(`[ADK Tool] Uploading base64 image to AWS S3...`);
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
      console.log(`[ADK Tool] Image upload complete: ${publicUrl}`);

      logUsage({
        userId,
        app: "blacknote",
        action: "imagen_generate",
        creditsUsed: imageCreditsCost,
        model: "imagen-3.0-generate-002",
        timestamp: new Date(),
      }).catch(console.error);

      return { url: publicUrl };
    } catch (err: any) {
      console.error("[ADK Tool] Error in generate_image tool:", err);

      if (balanceDeducted) {
        if (isPro) {
          await addCreditsByEmail(userEmail, imageCreditsCost);
        } else {
          await deductFreeCredits(userEmail, -imageCreditsCost);
        }
        console.log(`[ADK Tool] Refunded ${imageCreditsCost} credits to ${userEmail} due to error`);
      }

      return { error: `Failed to generate image: ${err?.message || "Internal API Error"}` };
    }
  }) as any,
}) as any;

export const allEditorTools = [
  insertContentTool,
  replaceBlockTool,
  deleteBlockTool,
  updateTitleTool,
  generateImageTool,
];
