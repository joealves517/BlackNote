let offscreenReadyResolver: (() => void) | null = null;
let offscreenReadyPromise: Promise<void> | null = null;

export default defineBackground(() => {
  // Open side panel when extension icon is clicked
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: Error) => console.error("Side panel setup error:", error));

  // Route clip requests from sidepanel → content script in the active tab
  browser.runtime.onMessage.addListener(
    (message: { type: string; targetExtensionId?: string; payload?: any; url?: string }, _sender, sendResponse) => {
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

      // Open a URL in a new tab (sidepanel has no chrome.tabs access)
      if (message.type === "OPEN_URL" && message.url) {
        chrome.tabs.create({ url: message.url });
        return false;
      }

      // Open Chrome settings for this extension
      if (message.type === "OPEN_EXTENSION_SETTINGS") {
        chrome.tabs.create({ url: `chrome://settings/content/siteDetails?site=chrome-extension://${chrome.runtime.id}` });
        return false;
      }

      if (message.type === "RELOAD_SIDEPANEL") {
        chrome.runtime.sendMessage({ type: "DO_RELOAD_SIDEPANEL" }).catch(() => {});
        // Also close the offscreen document to clear its permission cache
        chrome.offscreen.closeDocument().catch(() => {});
        return false;
      }

      if (message.type === "OFFSCREEN_READY") {
        if (offscreenReadyResolver) {
          offscreenReadyResolver();
          offscreenReadyResolver = null;
        }
        return false;
      }

      // ── Recording Orchestration (Side Panel / Content Script → Offscreen) ──
      
      const setupOffscreen = async () => {
        const offscreenUrl = chrome.runtime.getURL("offscreen.html");
        // @ts-ignore
        const existingContexts = await chrome.runtime.getContexts({
          contextTypes: ["OFFSCREEN_DOCUMENT"],
          documentUrls: [offscreenUrl],
        });

        if (existingContexts.length > 0) return;

        offscreenReadyPromise = new Promise((resolve) => {
          offscreenReadyResolver = resolve;
        });

        await chrome.offscreen.createDocument({
          url: offscreenUrl,
          reasons: ["USER_MEDIA", "DISPLAY_MEDIA", "AUDIO_PLAYBACK"],
          justification: "Recording microphone and screen for BlackNote",
        });

        // Wait for OFFSCREEN_READY message with a timeout of 5 seconds
        await Promise.race([
          offscreenReadyPromise,
          new Promise((resolve) => setTimeout(resolve, 5000))
        ]);
      };

      if (message.type === "OFFSCREEN_STATE_UPDATE") {
        // Offscreen doc doesn't have access to storage, so it delegates to background
        chrome.storage.local.get("blacknote_recording", (res) => {
          const current = res.blacknote_recording || {};
          chrome.storage.local.set({
            blacknote_recording: {
              ...current,
              ...message.payload,
            },
          });
        });
        return false;
      }

      if (message.type === "ENSURE_OFFSCREEN") {
        setupOffscreen().then(() => sendResponse({ ready: true })).catch(() => sendResponse({ ready: false }));
        return true;
      }

      if (message.type.startsWith("RECORDING_START_")) {
        console.log("[BG] ▶ RECORDING_START received:", message.type, "streamId:", !!message.payload?.streamId);

        const startOffscreen = async () => {
          await setupOffscreen();
          console.log("[BG] Offscreen ready, forwarding streamId:", !!message.payload?.streamId);
          
          return new Promise((resolve) => {
            chrome.runtime.sendMessage({
              type: message.type === "RECORDING_START_AUDIO" ? "OFFSCREEN_START_AUDIO" : "OFFSCREEN_START_SCREEN",
              streamId: message.payload?.streamId,
            }, resolve);
          });
        };

        startOffscreen().then((res: any) => {
          sendResponse(res);
          if (res && res.success === false) {
            setTimeout(() => {
              chrome.offscreen.closeDocument().catch(() => {});
            }, 100);
          }
        }).catch(err => {
          console.error("[BG] Failed to start offscreen recording:", err);
          chrome.offscreen.closeDocument().catch(() => {});
          sendResponse({ success: false, error: String(err) });
        });
        return true;
      }

      // ── ACTUAL COMMANDS FROM SIDE PANEL (use-recorder.ts) ──
      if (["RECORDING_STOP", "RECORDING_PAUSE", "RECORDING_RESUME", "RECORDING_DISCARD"].includes(message.type)) {
        const offscreenType = message.type.replace("RECORDING_", "OFFSCREEN_");
        chrome.runtime.sendMessage({ type: offscreenType }, (res) => {
          sendResponse?.(res);
          // Close offscreen document after stop or discard to save memory
          if (offscreenType === "OFFSCREEN_STOP" || offscreenType === "OFFSCREEN_DISCARD") {
            setTimeout(() => {
              chrome.offscreen.closeDocument().catch(() => {});
            }, 500);
          }
        });
        // We removed writing to blacknote_recording_command here to avoid infinite loops!
        return true;
      }

      // ── UI REQUESTS FROM EXTERNAL CONTROLS (Popup Panel, Action Icon) ──
      if (["UI_REQUEST_STOP", "UI_REQUEST_PAUSE", "UI_REQUEST_RESUME", "UI_REQUEST_DISCARD", "OFFSCREEN_TRIGGER_STOP"].includes(message.type)) {
        chrome.storage.local.get("blacknote_recording", (res) => {
          const isVisible = res.blacknote_recording?._panelVisible;
          if (isVisible) {
            // Tell Side Panel to handle it so it can insert into note
            const actionType = message.type === "OFFSCREEN_TRIGGER_STOP" 
              ? "RECORDING_STOP" 
              : message.type.replace("UI_REQUEST_", "RECORDING_");
            chrome.storage.local.set({
              blacknote_recording_command: {
                action: actionType,
                timestamp: Date.now(),
              },
            });
          } else {
            // Side panel is closed, execute directly
            const offscreenType = message.type === "OFFSCREEN_TRIGGER_STOP"
              ? "OFFSCREEN_STOP"
              : message.type.replace("UI_REQUEST_", "OFFSCREEN_");
            chrome.runtime.sendMessage({ type: offscreenType }, () => {
              if (offscreenType === "OFFSCREEN_STOP" || offscreenType === "OFFSCREEN_DISCARD") {
                setTimeout(() => {
                  chrome.offscreen.closeDocument().catch(() => {});
                }, 500);
              }
            });
          }
        });
        return false;
      }

      // Relay cross-extension messages from sidepanel → external extension
      // Background script uses raw chrome API, bypassing WXT polyfill
      if (message.type === "RELAY_EXTERNAL" && message.targetExtensionIds && message.targetExtensionIds.length > 0) {
        const ids = message.targetExtensionIds;

        // Resolve windowId first — sidepanel sender has no sender.tab,
        // so we must get it from the current window for the receiving
        // extension to be able to open its own sidepanel.
        chrome.windows.getCurrent((win) => {
          const payload = { ...message.payload };
          if (win?.id && !payload.windowId) {
            payload.windowId = win.id;
          }

          let currentIndex = 0;
          const tryNextId = () => {
            if (currentIndex >= ids.length) {
              console.warn("[Ecosystem] External relay failed for all IDs.");
              sendResponse(null);
              return;
            }

            const currentId = ids[currentIndex];
            chrome.runtime.sendMessage(currentId, payload, (response) => {
              if (chrome.runtime.lastError) {
                currentIndex++;
                tryNextId();
              } else {
                sendResponse(response);
              }
            });
          };

          tryNextId();
        });

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
          const targetWindowId = _sender.tab?.windowId || message.windowId || message.payload?.windowId;
          
          if (targetWindowId) {
            browser.sidePanel.open({ windowId: targetWindowId }).catch((err) => {
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
