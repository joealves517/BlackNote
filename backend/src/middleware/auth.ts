/**
 * Auth Middleware — Dual authentication supporting both:
 * 1. Google OAuth token (new extension versions)
 * 2. Supabase JWT (legacy extension versions still on Chrome Web Store)
 *
 * Both paths extract the same user info for downstream handlers.
 */

import { Request, Response, NextFunction } from "express";
import { config } from "../config/index.js";

export interface AuthenticatedRequest extends Request {
  userId: string;
  userEmail: string;
  userName: string;
  userPicture: string;
}

// ─── Google OAuth Token Verification ────────────────────────────────

interface GoogleTokenInfo {
  email: string;
  name?: string;
  picture?: string;
  sub: string;
  email_verified: string;
  aud: string;
}

async function verifyGoogleToken(
  token: string
): Promise<GoogleTokenInfo | null> {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${token}`
    );
    if (!res.ok) return null;

    const info = (await res.json()) as GoogleTokenInfo;

    // Verify the token belongs to our OAuth client
    if (info.email && info.email_verified === "true") {
      return info;
    }
    return null;
  } catch {
    return null;
  }
}

async function getGoogleUserInfo(
  token: string
): Promise<{ email: string; name: string; picture: string; sub: string } | null> {
  try {
    const res = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json() as { email: string; name: string; picture: string; sub: string };
    return data;
  } catch {
    return null;
  }
}

// ─── Middleware ─────────────────────────────────────────────────────

/**
 * Authenticate requests using Google OAuth token.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing_token" });
    return;
  }

  const token = authHeader.slice(7);

  const googleInfo = await verifyGoogleToken(token);
  if (googleInfo) {
    // Fetch full profile for display name and picture
    const userInfo = await getGoogleUserInfo(token);

    const authReq = req as AuthenticatedRequest;
    authReq.userId = googleInfo.sub;
    authReq.userEmail = googleInfo.email;
    authReq.userName = userInfo?.name || googleInfo.email.split("@")[0];
    authReq.userPicture = userInfo?.picture || "";
    return next();
  }

  // If Google token verification fails, return unauthorized immediately.
  console.error("[Auth] Google token verification failed");
  res.status(401).json({ error: "invalid_token" });
}
