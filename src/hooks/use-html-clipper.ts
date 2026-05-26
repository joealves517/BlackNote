import { useState, useCallback } from "react";
import { db } from "@/lib/local-db";

const DEFAULT_SINGLEFILE_OPTIONS = {
  removeHiddenElements: true,
  removeUnusedStyles: true,
  removeUnusedFonts: true,
  removeFrames: false,
  compressHTML: true,
  compressCSS: false,
  loadDeferredImages: true,
  loadDeferredImagesMaxIdleTime: 1500,
  loadDeferredImagesBlockCookies: false,
  loadDeferredImagesBlockStorage: false,
  loadDeferredImagesKeepZoomLevel: false,
  loadDeferredImagesDispatchScrollEvent: false,
  loadDeferredImagesBeforeFrames: false,
  removeAlternativeFonts: true,
  removeAlternativeMedias: true,
  removeAlternativeImages: true,
  groupDuplicateImages: true,
  maxSizeDuplicateImages: 512 * 1024,
  saveRawPage: false,
  saveToClipboard: false,
  insertCanonicalLink: true,
  insertMetaNoIndex: false,
  insertMetaCSP: true,
  insertSingleFileComment: true,
  removeSavedDate: false,
  blockMixedContent: false,
  saveOriginalURLs: false,
  acceptHeaders: {
    font: "application/font-woff2;q=1.0,application/font-woff;q=0.9,*/*;q=0.8",
    image: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    stylesheet: "text/css,*/*;q=0.1",
    script: "*/*",
    document: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    video: "video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5",
    audio: "audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5"
  },
  moveStylesInHead: false,
  networkTimeout: 0,
  blockImages: false,
  blockAlternativeImages: true,
  blockStylesheets: false,
  blockFonts: false,
  blockScripts: true,
  blockVideos: true,
  blockAudios: true,
  delayBeforeProcessing: 0,
  delayAfterProcessing: 0,
  resolveLinks: true,
  groupDuplicateStylesheets: false,
  removeNoScriptTags: true,
  imageReductionFactor: 1
};

export type HTMLClipStatus = "idle" | "clipping" | "done" | "error";

interface UseHTMLClipperReturn {
  clipHTML: (noteId: string) => Promise<string | null>;
  status: HTMLClipStatus;
  error: string | null;
  reset: () => void;
}

export function useHTMLClipper(): UseHTMLClipperReturn {
  const [status, setStatus] = useState<HTMLClipStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const clipHTML = useCallback(async (noteId: string): Promise<string | null> => {
    setStatus("clipping");
    setError(null);

    try {
      // 1. Get the current active tab
      const win = await browser.windows.getLastFocused({ windowTypes: ["normal"] });
      if (!win?.id) throw new Error("No active browser window found");

      const [tab] = await browser.tabs.query({ active: true, windowId: win.id });
      if (!tab?.id || !tab.url) throw new Error("No active tab found");

      const tabId = tab.id;

      // 2. Inject SingleFile core scripts into the active tab via background script
      const injectRes = await browser.runtime.sendMessage({
        type: "SINGLEFILE_INJECT_CORE",
        payload: { tabId, removeFrames: false }
      });

      if (injectRes?.error) {
        throw new Error(`Failed to inject SingleFile: ${injectRes.error}`);
      }

      // 3. Trigger capture in the tab's context using browser.scripting.executeScript
      const [scriptResult] = await browser.scripting.executeScript({
        target: { tabId },
        func: async (options) => {
          // @ts-ignore
          if (!globalThis.singlefile || !globalThis.singlefile.getPageData) {
            throw new Error("SingleFile engine is not initialized in tab");
          }
          // @ts-ignore
          return await globalThis.singlefile.getPageData(options);
        },
        args: [DEFAULT_SINGLEFILE_OPTIONS]
      });

      const pageData = scriptResult?.result as any;
      if (!pageData || !pageData.content) {
        throw new Error("SingleFile failed to serialize page content");
      }

      // 4. Save the captured HTML as a Blob in Dexie IndexedDB
      const htmlBlob = new Blob([pageData.content], { type: "text/html" });
      const clipId = crypto.randomUUID();

      await db.web_clips.add({
        id: clipId,
        noteId,
        title: pageData.title || tab.title || "Untitled Web Clip",
        url: tab.url,
        htmlBlob,
        createdAt: Date.now()
      });

      setStatus("done");
      return clipId;
    } catch (err: any) {
      console.error("[useHTMLClipper] Clip failed:", err);
      setError(err?.message || "Failed to save offline HTML");
      setStatus("error");
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  return { clipHTML, status, error, reset };
}
