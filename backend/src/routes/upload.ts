/**
 * Upload Routes — S3 presigned URL generation for image uploads.
 * Extension uploads directly to S3 using the presigned URL,
 * bypassing the backend for the actual file transfer.
 */

import { Router, Request, Response } from "express";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { config } from "../config/index.js";

const router = Router();

const s3 = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

const BUCKET = config.aws.s3Bucket;
const S3_PUBLIC_URL = `https://${BUCKET}.s3.${config.aws.region}.amazonaws.com`;

/**
 * POST /api/upload/presign
 * Generate a presigned PUT URL for uploading an image to S3.
 * Body: { fileName: string, contentType: string }
 * Returns: { uploadUrl: string, publicUrl: string }
 */
router.post(
  "/presign",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { userEmail } = req as AuthenticatedRequest;
    const { fileName, contentType } = req.body as {
      fileName: string;
      contentType: string;
    };

    if (!fileName || !contentType) {
      res.status(400).json({ error: "missing_params" });
      return;
    }

    // Sanitize filename and scope to user's email prefix
    const sanitizedEmail = userEmail.replace(/[^a-zA-Z0-9]/g, "_");
    const timestamp = Date.now();
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${sanitizedEmail}/${timestamp}-${safeName}`;

    try {
      const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      });

      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
      const publicUrl = `${S3_PUBLIC_URL}/${key}`;

      res.json({ uploadUrl, publicUrl });
    } catch (err) {
      console.error("[Upload] Presign failed:", err);
      res.status(500).json({ error: "presign_failed" });
    }
  }
);

export default router;
