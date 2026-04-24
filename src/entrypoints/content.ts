/**
 * Content script — injected into web pages.
 * Responds to CLIP_PAGE messages by capturing the fully-rendered DOM.
 */
export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    browser.runtime.onMessage.addListener(
      (message: { type: string }, _sender, sendResponse) => {
        if (message.type !== "CLIP_PAGE") return false;

        try {
          sendResponse({
            html: document.documentElement.outerHTML,
            url: window.location.href,
            title: document.title,
          });
        } catch (error) {
          sendResponse({
            error: error instanceof Error ? error.message : "DOM capture failed",
          });
        }

        return true;
      }
    );
  },
});
