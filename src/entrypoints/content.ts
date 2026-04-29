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

          if (!parsed) {
            sendResponse({
              error: "Could not extract readable content from this page.",
              errorCode: ErrorCode.NO_READABLE_CONTENT,
            });
            return true;
          }

          sendResponse({ parsed });
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

    const markdown = `# ${videoTitle}\n\n${transcriptSection}`;

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
