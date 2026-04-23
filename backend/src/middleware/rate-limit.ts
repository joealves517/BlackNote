import { Request, Response, NextFunction } from "express";

/**
 * Simple in-memory rate limiter per IP.
 * Sufficient for Cloud Run — each instance has its own window.
 * For stricter global limits, use Redis or Cloud Tasks.
 */
const requestCounts = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 30; // per window per IP

export function rateLimit(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();

  let entry = requestCounts.get(ip);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    requestCounts.set(ip, entry);
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    res.status(429).json({ error: "rate_limit_exceeded" });
    return;
  }

  // Cleanup old entries periodically (every 100 requests)
  if (requestCounts.size > 1000) {
    for (const [key, val] of requestCounts) {
      if (now > val.resetAt) requestCounts.delete(key);
    }
  }

  next();
}
