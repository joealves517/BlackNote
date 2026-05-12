/**
 * Content script — injected into web pages.
 * Responds to CLIP_PAGE messages by capturing and parsing the DOM locally.
 * For YouTube pages, extracts video transcript instead of raw page HTML.
 */
import { extractPageContent } from "@/lib/page-reader";
import {
  isYouTubePage,
  extractTranscript,
  getVideoTitle,
} from "@/lib/youtube-transcript";
import { ErrorCode } from "@/lib/constants";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    browser.runtime.onMessage.addListener(
      (message: { type: string; action?: string }, _sender, sendResponse) => {
        if (message.action === "start-region-capture") {
          startRegionCapture();
          sendResponse({ started: true });
          return true;
        }

        if (message.type !== "CLIP_PAGE") return false;

        // YouTube pages — extract transcript for meaningful content
        if (isYouTubePage()) {
          handleYouTubeClip(sendResponse);
          return true; // Keep channel open for async
        }

        // Regular pages — standard DOM extraction
        try {
          const SPA_DOMAINS = [
            'mail.google.com', 'console.cloud.google.com', 'console.aws.amazon.com',
            'notion.so', 'discord.com', 'slack.com', 'web.telegram.org',
            'twitter.com', 'x.com', 'web.whatsapp.com', 'messenger.com',
            'teams.microsoft.com', 'app.asana.com', 'trello.com',
            'figma.com', 'linear.app', 'vercel.com',
          ];
          const isSPA = SPA_DOMAINS.some(domain => window.location.hostname.includes(domain));

          if (isSPA) {
            const title = document.title || "";
            const bodyText = document.body ? getDeepText(document.body).replace(/\n{3,}/g, '\n\n').trim() : "";
            const maxChars = 50000;
            const truncated = bodyText.length > maxChars ? bodyText.substring(0, maxChars) + "\n\n[Content truncated...]" : bodyText;

            if (!truncated) {
              sendResponse({ error: "Could not extract readable content from this page.", errorCode: ErrorCode.NO_READABLE_CONTENT });
              return true;
            }

            sendResponse({
              parsed: {
                title: title,
                markdown: `URL: ${window.location.href}\n\n${truncated}`,
                excerpt: truncated.substring(0, 200) + "...",
                siteName: new URL(window.location.href).hostname,
                byline: null,
                url: window.location.href,
                wordCount: truncated.split(/\s+/).length,
                clippedAt: new Date().toISOString(),
              }
            });
            return true;
          }

          const parsed = extractPageContent(null, window.location.href);

          if (parsed && parsed.markdown.length > 100) {
            sendResponse({ parsed });
          } else {
            const title = document.title || "";
            const bodyText = document.body ? getDeepText(document.body).replace(/\n{3,}/g, '\n\n').trim() : "";
            const maxChars = 50000;
            const truncated =
              bodyText.length > maxChars
                ? bodyText.substring(0, maxChars) + "\n\n[Content truncated...]"
                : bodyText;

            if (!truncated) {
              sendResponse({
                error: "Could not extract readable content from this page.",
                errorCode: ErrorCode.NO_READABLE_CONTENT,
              });
              return true;
            }

            const fallbackParsed = {
              title: title,
              markdown: `URL: ${window.location.href}\n\n${truncated}`,
              excerpt: truncated.substring(0, 200) + "...",
              siteName: new URL(window.location.href).hostname,
              byline: null,
              url: window.location.href,
              wordCount: truncated.split(/\s+/).length,
              clippedAt: new Date().toISOString(),
            };

            sendResponse({ parsed: fallbackParsed });
          }
        } catch (error) {
          sendResponse({
            error:
              error instanceof Error
                ? error.message
                : "DOM capture/parsing failed",
            errorCode: ErrorCode.DOM_CAPTURE_FAILED,
          });
        }

        return true;
      }
    );
  },
});

/**
 * Recursively extracts text from DOM nodes, piercing through open Shadow DOMs.
 * Bypasses noisy elements to provide a clean text representation of complex SPAs.
 */
function getDeepText(node: Node): string {
  if (!node) return "";
  let text = "";

  if (node.nodeType === Node.TEXT_NODE) {
    const content = node.textContent?.trim();
    return content ? content + " " : "";
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const tag = (node as Element).tagName.toLowerCase();
    if (['script', 'style', 'noscript', 'svg', 'canvas', 'video', 'audio'].includes(tag)) {
      return "";
    }
    
    try {
       const style = window.getComputedStyle(node as Element);
       if (style.display === 'none' || style.visibility === 'hidden') return "";
    } catch {
       // Ignore
    }
  }

  const el = node as Element;
  if (el.shadowRoot) {
    text += getDeepText(el.shadowRoot) + "\n";
  }

  node.childNodes.forEach(child => {
    text += getDeepText(child);
  });

  if (node.nodeType === Node.ELEMENT_NODE) {
    const tag = (node as Element).tagName.toLowerCase();
    const blockTags = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'article', 'section', 'main', 'tr'];
    if (blockTags.includes(tag)) {
      text += "\n";
    }
  }

  return text;
}

/**
 * Handle YouTube page clipping by extracting the video transcript.
 * Falls back to title-only if transcript is unavailable.
 */
async function handleYouTubeClip(
  sendResponse: (response: any) => void
) {
  try {
    const videoTitle = getVideoTitle();
    const transcript = await extractTranscript();

    const transcriptSection = transcript
      ? `## Video Transcript\n\n${transcript}`
      : "_No transcript available for this video._";

    const markdown = transcriptSection;

    sendResponse({
      parsed: {
        title: videoTitle,
        markdown,
        excerpt: transcript
          ? transcript.substring(0, 200) + "..."
          : "YouTube video (no transcript available)",
        siteName: "YouTube",
        byline: null,
        url: window.location.href,
        wordCount: markdown.split(/\s+/).length,
        clippedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    sendResponse({
      error:
        error instanceof Error
          ? error.message
          : "YouTube transcript extraction failed",
      errorCode: ErrorCode.TRANSCRIPT_NOT_FOUND,
    });
  }
}

/**
 * Region Capture Logic
 */
let captureOverlay: HTMLDivElement | null = null;
let startX = 0, startY = 0;
let isDragging = false;
let selectionBox: HTMLDivElement | null = null;

function startRegionCapture() {
  if (captureOverlay) return;

  captureOverlay = document.createElement("div");
  captureOverlay.style.position = "fixed";
  captureOverlay.style.top = "0";
  captureOverlay.style.left = "0";
  captureOverlay.style.width = "100vw";
  captureOverlay.style.height = "100vh";
  captureOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.4)";
  captureOverlay.style.zIndex = "2147483647"; // Max z-index
  captureOverlay.style.cursor = "crosshair";

  selectionBox = document.createElement("div");
  selectionBox.style.position = "absolute";
  selectionBox.style.border = "2px dashed #fff";
  selectionBox.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
  selectionBox.style.pointerEvents = "none";
  selectionBox.style.display = "none";
  captureOverlay.appendChild(selectionBox);

  captureOverlay.addEventListener("mousedown", onMouseDown);
  captureOverlay.addEventListener("mousemove", onMouseMove);
  captureOverlay.addEventListener("mouseup", onMouseUp);

  document.body.appendChild(captureOverlay);
}

function onMouseDown(e: MouseEvent) {
  startX = e.clientX;
  startY = e.clientY;
  isDragging = true;

  if (selectionBox) {
    selectionBox.style.left = `${startX}px`;
    selectionBox.style.top = `${startY}px`;
    selectionBox.style.width = "0px";
    selectionBox.style.height = "0px";
    selectionBox.style.display = "block";
  }
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging || !selectionBox) return;

  const currentX = e.clientX;
  const currentY = e.clientY;

  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);

  selectionBox.style.left = `${left}px`;
  selectionBox.style.top = `${top}px`;
  selectionBox.style.width = `${width}px`;
  selectionBox.style.height = `${height}px`;
}

function onMouseUp(e: MouseEvent) {
  if (!isDragging || !captureOverlay || !selectionBox) return;
  isDragging = false;

  const width = parseInt(selectionBox.style.width, 10);
  const height = parseInt(selectionBox.style.height, 10);
  const left = parseInt(selectionBox.style.left, 10);
  const top = parseInt(selectionBox.style.top, 10);

  // Cleanup
  captureOverlay.remove();
  captureOverlay = null;
  selectionBox = null;

  // Don't capture if region is too small
  if (width < 10 || height < 10) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = {
    x: left * dpr,
    y: top * dpr,
    width: width * dpr,
    height: height * dpr
  };

  // Give DOM a tick to clear the overlay
  setTimeout(() => {
    browser.runtime.sendMessage({ type: "PROCESS_REGION_CAPTURE", rect });
  }, 100);
}
