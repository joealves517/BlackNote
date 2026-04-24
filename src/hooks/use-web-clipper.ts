/**
 * Hook to clip the current active tab's page content.
 * Handles the full pipeline: message background → content script → parse → return.
 */

import { useState, useCallback } from "react";
import { extractPageContent, type PageContent } from "@/lib/page-reader";

type ClipStatus = "idle" | "clipping" | "done" | "error";

interface UseWebClipperReturn {
  clip: () => Promise<void>;
  status: ClipStatus;
  content: PageContent | null;
  error: string | null;
  reset: () => void;
}

export function useWebClipper(): UseWebClipperReturn {
  const [status, setStatus] = useState<ClipStatus>("idle");
  const [content, setContent] = useState<PageContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clip = useCallback(async () => {
    setStatus("clipping");
    setError(null);
    setContent(null);

    try {
      const response: { html?: string; url?: string; error?: string } =
        await browser.runtime.sendMessage({ type: "REQUEST_CLIP" });

      if (response.error) {
        throw new Error(response.error);
      }

      if (!response.html || !response.url) {
        throw new Error("Could not capture page content");
      }

      const parsed = extractPageContent(response.html, response.url);

      if (!parsed) {
        throw new Error(
          "Could not extract readable content from this page. " +
            "The page may be behind a login wall or have minimal text content."
        );
      }

      setContent(parsed);
      setStatus("done");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Clip failed";
      setError(message);
      setStatus("error");
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setContent(null);
    setError(null);
  }, []);

  return { clip, status, content, error, reset };
}
