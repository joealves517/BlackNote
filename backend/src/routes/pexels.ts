/**
 * Pexels Search Proxy Route — For secure stock photos and videos search.
 * Bypasses direct Pexels API calls from client to protect the API key.
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { config } from "../config/index.js";

const router = Router();

/**
 * GET /api/pexels/search
 * Search stock photos or videos from Pexels securely.
 * Query: { query: string, type?: 'photos' | 'videos', page?: number, perPage?: number }
 */
router.get(
  "/search",
  async (req: Request, res: Response): Promise<void> => {
    const { query, type = "photos", page = "1", perPage = "15" } = req.query as {
      query: string;
      type?: "photos" | "videos";
      page?: string;
      perPage?: string;
    };

    if (!query) {
      res.status(400).json({ error: "missing_query" });
      return;
    }

    const apiKey = config.pexels.apiKey;
    if (!apiKey) {
      console.error("[Pexels Proxy] API key is not configured in environment variables.");
      res.status(500).json({ error: "pexels_key_not_configured" });
      return;
    }

    try {
      const pexelsUrl = type === "videos"
        ? `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`
        : `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`;

      const response = await fetch(pexelsUrl, {
        headers: {
          Authorization: apiKey,
        },
      });

      if (!response.ok) {
        console.error(`[Pexels Proxy] Remote API error: ${response.status} ${response.statusText}`);
        res.status(response.status).json({ error: "pexels_remote_error" });
        return;
      }

      const data = await response.json();
      res.json(data);
    } catch (err) {
      console.error("[Pexels Proxy] Search failed:", err);
      res.status(500).json({ error: "pexels_search_failed" });
    }
  }
);

export default router;
