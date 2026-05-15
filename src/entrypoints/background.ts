let offscreenReadyResolver: (() => void) | null = null;
let offscreenReadyPromise: Promise<void> | null = null;

let popoutWindowId: number | null = null;

// Track when the pop-out window is closed natively (e.g. by clicking X)
browser.windows.onRemoved.addListener((windowId) => {
  if (windowId === popoutWindowId) {
    popoutWindowId = null;
    
    // Clear the active flag
    browser.storage.local.set({ blacknote_popout_active: false });

    // Re-enable side panel opening on extension icon click
    browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  }
});

export default defineBackground(() => {
  // Open side panel when extension icon is clicked (default behavior)
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: Error) => console.error("Side panel setup error:", error));

  // Handle extension icon click manually when the side panel default behavior is disabled
  browser.action.onClicked.addListener((tab) => {
    if (popoutWindowId) {
      // Focus the existing pop-out window instead of opening the side panel
      browser.windows.update(popoutWindowId, { focused: true }).catch(console.error);
    }
  });

  // Route clip requests from sidepanel → content script in the active tab
  browser.runtime.onMessage.addListener(
    (message: { type: string; targetExtensionId?: string; payload?: any; url?: string }, _sender, sendResponse) => {
      if (message.type === "REQUEST_CLIP") {
        browser.windows.getLastFocused({ windowTypes: ['normal'] })
          .then((win) => {
            if (!win?.id) throw new Error("No normal window found");
            return browser.tabs.query({ active: true, windowId: win.id });
          })
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

      // Proxy fetch for YouTube InnerTube API to bypass CORS in Side Panel
      if (message.type === "FETCH_YOUTUBE_TRANSCRIPT" && message.url) {
        // Prevent sending browser cookies which cause 403 when using ANDROID client
        const payload = { ...message.payload, credentials: "omit" };
        fetch(message.url, payload)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.text(); // Always return text, let caller parse
          })
          .then((data) => sendResponse({ data }))
          .catch((err) => sendResponse({ error: err.message }));
        return true;
      }

      // Open a URL in a new tab (sidepanel has no chrome.tabs access)
      if (message.type === "OPEN_URL" && message.url) {
        chrome.tabs.create({ url: message.url });
        return false;
      }

      // Pop out the side panel into a standalone floating window
      if (message.type === "OPEN_PIP_WINDOW") {
        const { width, height, sourceWindowId, left, top } = message.payload || {};
        
        const createOptions: chrome.windows.CreateData = {
          url: chrome.runtime.getURL("sidepanel.html") + "?popout=1&sourceWindowId=" + (sourceWindowId || ""),
          type: "popup",
          width: width || 420,
          height: height || 650,
          focused: true,
        };

        if (left !== undefined && top !== undefined) {
          createOptions.left = Math.round(left);
          createOptions.top = Math.round(top);
        }

        chrome.windows.create(createOptions, (win) => {
          if (win?.id) {
            popoutWindowId = win.id;
            // Disable default side panel behavior so we can intercept the action click to focus the popout
            browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);
          }
          sendResponse({ windowId: win?.id ?? null });
        });
        return true;
      }

      // Close a previously opened pop-out window
      if (message.type === "CLOSE_PIP_WINDOW" && message.windowId) {
        chrome.windows.remove(message.windowId).catch(() => {});
        return false;
      }



      // Re-open the side panel on the active tab (Requires user gesture)
      if (message.type === "OPEN_SIDE_PANEL" && message.windowId) {
        // Must be called synchronously in the message listener to preserve the user gesture
        chrome.sidePanel.open({ windowId: message.windowId }).catch(console.error);
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

      // ── Region Capture ──
      if (message.type === "PROCESS_REGION_CAPTURE" && message.rect) {
        browser.tabs.captureVisibleTab(null as any, { format: "png" }).then(async (dataUrl) => {
          try {
            const rect = message.rect;
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            const bitmap = await createImageBitmap(blob);

            const canvas = new OffscreenCanvas(rect.width, rect.height);
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
              const croppedBlob = await canvas.convertToBlob({ type: "image/png" });
              const reader = new FileReader();
              reader.onloadend = () => {
                // Send back to the side panel
                chrome.runtime.sendMessage({ 
                  type: "REGION_CAPTURED", 
                  dataUrl: reader.result 
                });
              };
              reader.readAsDataURL(croppedBlob);
            }
          } catch (e) {
            console.error("Failed to crop region capture:", e);
          }
        });
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
              isPremium: message.payload?.isPremium,
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
      
      if (message.type === "OFFSCREEN_LIMIT_REACHED") {
        setTimeout(() => {
          chrome.offscreen.closeDocument().catch(() => {});
        }, 500);
        return false;
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
