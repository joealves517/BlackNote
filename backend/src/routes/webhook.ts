import { Router, Request, Response } from "express";
import {
  verifyWebhookSignature,
  LSWebhookPayload,
} from "../services/lemonsqueezy.js";
import {
  addCreditsByEmail,
  updateSubscriptionByEmail,
  findUserByLemonSqueezyCustomerId,
} from "../services/firestore.js";

const router = Router();

// Credits granted per subscription creation/renewal
const CREDITS_PER_CYCLE = 1000;

/**
 * POST /api/webhook/ls
 * Handles Lemon Squeezy webhook events.
 * Must receive raw body for signature verification.
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers["x-signature"] as string;

  if (!signature) {
    res.status(400).json({ error: "missing_signature" });
    return;
  }

  // req.body is a Buffer because of express.raw() middleware on this route
  const rawBody = req.body as Buffer;

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error("[Webhook] Invalid signature");
    res.status(400).json({ error: "invalid_signature" });
    return;
  }

  const payload: LSWebhookPayload = JSON.parse(rawBody.toString());
  const eventName = payload.meta.event_name;
  const customUserId = payload.meta.custom_data?.user_id;

  console.log(`[Webhook] Event: ${eventName}, userId: ${customUserId || "N/A"}`);

  try {
    switch (eventName) {
      case "subscription_created": {
        const email = String((payload.data.attributes as any).user_email || "");
        if (!email) {
          console.error("[Webhook] subscription_created without user_email");
          break;
        }

        const attrs = payload.data.attributes as Record<string, unknown>;
        const customerId = String(attrs.customer_id || "");

        // Extract subscription_item_id from first_subscription_item relationship
        const subscriptionItemId = extractSubscriptionItemId(payload);

        await updateSubscriptionByEmail(email, {
          tier: "premium",
          customerId,
          subscriptionId: payload.data.id,
          subscriptionItemId,
          status: String(attrs.status || "active"),
          currentPeriodEnd: attrs.renews_at
            ? new Date(attrs.renews_at as string)
            : null,
        });

        // Grant initial credits
        await addCreditsByEmail(email, CREDITS_PER_CYCLE);
        console.log(
          `[Webhook] User ${email} upgraded to premium with ${CREDITS_PER_CYCLE} credits`
        );
        break;
      }

      case "order_created": {
        const email = String((payload.data.attributes as any).user_email || "");
        if (!email) {
          console.error("[Webhook] order_created without user_email");
          break;
        }

        const orderAttrs = payload.data.attributes as Record<string, unknown>;
        const orderCustomerId = String(orderAttrs.customer_id || "");

        await updateSubscriptionByEmail(email, {
          tier: "premium",
          customerId: orderCustomerId,
          subscriptionId: payload.data.id,
          status: String(orderAttrs.status || "paid"),
          currentPeriodEnd: null,
        });

        await addCreditsByEmail(email, CREDITS_PER_CYCLE);
        console.log(
          `[Webhook] User ${email} purchased ${CREDITS_PER_CYCLE} credits via order`
        );
        break;
      }

      case "subscription_updated": {
        const email = String((payload.data.attributes as any).user_email || "");
        const attrs = payload.data.attributes as Record<string, unknown>;

        if (!email) {
          console.error("[Webhook] subscription_updated without user_email");
          break;
        }

        await updateSubscriptionByEmail(email, {
          status: String(attrs.status || ""),
          currentPeriodEnd: attrs.renews_at
            ? new Date(attrs.renews_at as string)
            : null,
        });
        break;
      }

      case "subscription_payment_success": {
        const email = String((payload.data.attributes as any).user_email || "");
        if (email) {
          await addCreditsByEmail(email, CREDITS_PER_CYCLE);
          console.log(
            `[Webhook] Renewed ${CREDITS_PER_CYCLE} credits for ${email}`
          );
        }
        break;
      }

      case "subscription_cancelled": {
        const email = String((payload.data.attributes as any).user_email || "");
        if (email) {
          await updateSubscriptionByEmail(email, {
            tier: "free",
            status: "cancelled",
          });
          console.log(`[Webhook] User ${email} subscription cancelled`);
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event: ${eventName}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("[Webhook] Processing error:", error);
    res.status(500).json({ error: "webhook_processing_failed" });
  }
});

function extractSubscriptionItemId(
  payload: LSWebhookPayload
): string | null {
  try {
    const relationships = payload.data.relationships as Record<string, unknown>;
    const firstItem = relationships?.["first-subscription-item"] as Record<
      string,
      unknown
    >;
    const data = firstItem?.data as Record<string, unknown>;
    return data?.id ? String(data.id) : null;
  } catch {
    return null;
  }
}

export default router;
