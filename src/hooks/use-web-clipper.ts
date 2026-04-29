/**
 * Hook to clip the current active tab's page content.
 * Handles the full pipeline: message background → content script → parse → return.
 */

import { useState, useCallback } from "react";
import { type PageContent } from "@/lib/page-reader";
import { ErrorCode } from "@/lib/constants";

type ClipStatus = "idle" | "clipping" | "done" | "error";

interface UseWebClipperReturn {
  clip: () => Promise<void>;
  status: ClipStatus;
  content: PageContent | null;
  error: { message: string; code?: ErrorCode } | null;
  reset: () => void;
}

export function useWebClipper(): UseWebClipperReturn {
  const [status, setStatus] = useState<ClipStatus>("idle");
  const [content, setContent] = useState<PageContent | null>(null);
  const [error, setError] = useState<{ message: string; code?: ErrorCode } | null>(null);

  const clip = useCallback(async () => {
    setStatus("clipping");
    setError(null);
    setContent(null);

    try {
      const response: { parsed?: PageContent; error?: string; errorCode?: ErrorCode } =
        await browser.runtime.sendMessage({ type: "REQUEST_CLIP" });

      if (response.error) {
        // We throw an object that we will catch and parse
        throw { message: response.error, code: response.errorCode };
      }

      if (!response.parsed) {
        throw { message: "Could not capture page content", code: ErrorCode.NO_READABLE_CONTENT };
      }

      setContent(response.parsed);
      setStatus("done");
    } catch (err: any) {
      setError({
        message: err?.message || "Clip failed",
        code: err?.code || ErrorCode.CLIP_FAILED,
      });
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
