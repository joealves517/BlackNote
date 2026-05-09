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
      (message: { type: string }, _sender, sendResponse) => {
        if (message.type !== "CLIP_PAGE") return false;

        // YouTube pages — extract transcript for meaningful content
        if (isYouTubePage()) {
          handleYouTubeClip(sendResponse);
          return true; // Keep channel open for async
        }

        // Regular pages — standard DOM extraction
        try {
          const parsed = extractPageContent(
            document.documentElement.outerHTML,
            window.location.href
          );

          const isWebApp = ['mail.google.com', 'console.cloud.google.com', 'console.aws.amazon.com', 'notion.so'].some(domain => window.location.hostname.includes(domain));

          if (parsed && !isWebApp && parsed.markdown.length > 150) {
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
