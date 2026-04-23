import crypto from "node:crypto";
import { config } from "../config/index.js";

const LS_API_BASE = "https://api.lemonsqueezy.com/v1";

/**
 * Verify a Lemon Squeezy webhook signature (HMAC SHA-256).
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string
): boolean {
  const hmac = crypto.createHmac("sha256", config.lemonSqueezy.webhookSecret);
  const digest = hmac.update(rawBody).digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(digest, "utf8"),
    Buffer.from(signature, "utf8")
  );
}

/**
 * Report usage to Lemon Squeezy (increment action for sum aggregation).
 */
export async function reportUsage(
  subscriptionItemId: string,
  quantity: number
): Promise<void> {
  const response = await fetch(`${LS_API_BASE}/usage-records`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${config.lemonSqueezy.apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: "usage-records",
        attributes: {
          quantity,
          action: "increment",
        },
        relationships: {
          "subscription-item": {
            data: {
              type: "subscription-items",
              id: subscriptionItemId,
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(
      `[LemonSqueezy] Usage report failed: ${response.status} ${errorText}`
    );
  }
}

// ─── Webhook Payload Types ──────────────────────────────────────────

export interface LSWebhookPayload {
  meta: {
    event_name: string;
    custom_data?: {
      user_id?: string;
    };
  };
  data: {
    id: string;
    type: string;
    attributes: Record<string, unknown>;
    relationships?: Record<string, unknown>;
  };
}
