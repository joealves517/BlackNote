import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import { createOrUpdateUser } from "../services/firestore.js";

const router = Router();

/**
 * GET /api/user
 * Returns user profile, tier, and credits balance.
 * Creates user document in Firestore if it doesn't exist yet.
 */
router.get(
  "/",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authReq = req as AuthenticatedRequest;

    const user = await createOrUpdateUser(authReq.userId, {
      email: authReq.userEmail,
      displayName: authReq.userName,
      picture: authReq.userPicture,
    });

    res.json({
      userId: authReq.userId,
      email: user.email,
      displayName: user.displayName,
      picture: user.picture,
      tier: user.tier,
      credits: user.credits,
      subscription: {
        status: user.lemonSqueezy.status,
        currentPeriodEnd: user.lemonSqueezy.currentPeriodEnd,
      },
    });
  }
);

export default router;
