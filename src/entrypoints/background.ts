export default defineBackground(() => {
  // Open side panel when extension icon is clicked
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: Error) => console.error("Side panel setup error:", error));

  // Route clip requests from sidepanel → content script in the active tab
  browser.runtime.onMessage.addListener(
    (message: { type: string }, _sender, sendResponse) => {
      if (message.type !== "REQUEST_CLIP") return false;

      browser.tabs
        .query({ active: true, currentWindow: true })
        .then(([tab]) => {
          if (!tab?.id) throw new Error("No active tab found");
          return browser.tabs.sendMessage(tab.id, { type: "CLIP_PAGE" });
        })
        .then((response) => sendResponse(response))
        .catch((err) =>
          sendResponse({ error: err instanceof Error ? err.message : String(err) })
        );

      return true; // keep channel open for async response
    }
  );
});
