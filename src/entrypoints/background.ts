export default defineBackground(() => {
  // Open side panel when extension icon is clicked
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: Error) => console.error("Side panel setup error:", error));

  // Route clip requests from sidepanel → content script in the active tab
  browser.runtime.onMessage.addListener(
    (message: { type: string; targetExtensionId?: string; payload?: any }, _sender, sendResponse) => {
      if (message.type === "REQUEST_CLIP") {
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
        return true;
      }

      // Relay cross-extension messages from sidepanel → external extension
      // Background script uses raw chrome API, bypassing WXT polyfill
      if (message.type === "RELAY_EXTERNAL" && message.targetExtensionIds && message.targetExtensionIds.length > 0) {
        const ids = message.targetExtensionIds;
        let currentIndex = 0;

        const tryNextId = () => {
          if (currentIndex >= ids.length) {
            console.warn("[Ecosystem] External relay failed for all IDs.");
            sendResponse(null);
            return;
          }

          const currentId = ids[currentIndex];
          chrome.runtime.sendMessage(currentId, message.payload, (response) => {
            if (chrome.runtime.lastError) {
              currentIndex++;
              tryNextId();
            } else {
              sendResponse(response);
            }
          });
        };

        tryNextId();
        return true; // keep channel open for async sendResponse
      }

      return false;
    }
  );

  // ─── Cross-Extension Communication ────────────────────────────────
  // Allow sister extensions (Spark AI, AI Recorder) to interact with BlackNote
  chrome.runtime.onMessageExternal.addListener(
    (message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
      // Health check — lets other extensions detect if BlackNote is installed
      if (message.type === "PING") {
        sendResponse({ pong: true });
        return;
      }

      // Insert content as a new note (from Spark AI or AI Recorder)
      if (message.type === "INSERT_TO_BLACKNOTE") {
        const { title, content } = message.payload || {};
        if (title && content) {
          // Store pending note for the sidepanel to pick up
          chrome.storage.local.set({
            ecosystem_pending_note: { title, content, timestamp: Date.now() },
          });

          // Open the sidepanel if the sender provides a valid window/tab context, or fallback to current window
          if (_sender.tab?.windowId) {
            browser.sidePanel.open({ windowId: _sender.tab.windowId }).catch((err) => {
              console.warn("Failed to open sidepanel from external message:", err);
            });
          } else {
            chrome.windows.getCurrent((win) => {
              if (win && win.id) {
                browser.sidePanel.open({ windowId: win.id }).catch((err) => {
                  console.warn("Failed to open sidepanel using current window:", err);
                });
              }
            });
          }

          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: "missing_payload" });
        }
        return;
      }
    }
  );
});
