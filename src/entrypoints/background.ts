

export default defineBackground({
  main: () => {
    // ── Context Menus (only create once on install/update) ──
    chrome.runtime.onInstalled.addListener(() => {
      chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
          id: 'blacknote-clip-web',
          title: 'BlackNote - Clip Web',
          contexts: ['page', 'selection'],
        });

        chrome.contextMenus.create({
          id: 'blacknote-save-full-page',
          parentId: 'blacknote-clip-web',
          title: 'Save full page',
          contexts: ['page', 'selection'],
        });

        chrome.contextMenus.create({
          id: 'blacknote-save-selection',
          parentId: 'blacknote-clip-web',
          title: 'Save selection',
          contexts: ['selection'],
        });

        chrome.contextMenus.create({
          id: 'blacknote-save-all-tabs',
          parentId: 'blacknote-clip-web',
          title: 'Save all tabs',
          contexts: ['page', 'selection'],
        });
      });
    });

    // ── Helpers ──
    async function capturePage(tabId: number): Promise<{ content: string; title: string }> {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['lib/single-file.js'],
      });

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: async () => {
          const sf = (globalThis as any).singlefile;
          if (!sf) throw new Error('SingleFile library not loaded');
          const pageData = await sf.getPageData({
            removeHiddenElements: true,
            removeUnusedStyles: true,
            removeUnusedFonts: true,
            removeFrames: false,
            compressHTML: true,
            blockScripts: true,
            blockVideos: false,
            blockAudios: false,
            removeAlternativeFonts: true,
            removeAlternativeMedias: true,
            removeAlternativeImages: true,
            groupDuplicateImages: true,
          });
          return { content: pageData.content, title: pageData.title };
        },
      });

      const data = results?.[0]?.result;
      if (!data?.content) throw new Error('No content captured');
      return data;
    }

    function saveCapturedClip(title: string, url: string, content: string) {
      chrome.storage.local.set({
        singlefile_pending_clip: { title, url, content, timestamp: Date.now() },
      });
    }

    /** Inject a goey-toast-style notification into the webpage via Shadow DOM */
    function showPageToast(tabId: number, message: string, isError = false) {
      chrome.scripting.executeScript({
        target: { tabId },
        func: (msg: string, err: boolean) => {
          // Remove existing toast
          const existing = document.getElementById('__blacknote_toast_host__');
          if (existing) existing.remove();

          // Create host + shadow DOM to isolate styles
          const host = document.createElement('div');
          host.id = '__blacknote_toast_host__';
          Object.assign(host.style, {
            position: 'fixed', bottom: '20px', right: '20px',
            zIndex: '2147483647', pointerEvents: 'none',
          });

          const shadow = host.attachShadow({ mode: 'closed' });

          const icon = err
            ? `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#ef4444" stroke-width="1.5"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round"/></svg>`
            : `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#22c55e" stroke-width="1.5"/><path d="M5 8.5l2 2 4-4.5" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

          shadow.innerHTML = `
            <style>
              @keyframes slideIn {
                from { opacity: 0; transform: translateY(12px) scale(0.96); }
                to { opacity: 1; transform: translateY(0) scale(1); }
              }
              @keyframes slideOut {
                from { opacity: 1; transform: translateY(0) scale(1); }
                to { opacity: 0; transform: translateY(-8px) scale(0.96); }
              }
              .toast {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 10px 16px;
                border-radius: 12px;
                background: #1c1c1e;
                color: #f5f5f7;
                font: 500 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                box-shadow:
                  0 4px 12px rgba(0,0,0,0.15),
                  0 1px 4px rgba(0,0,0,0.08),
                  inset 0 0.5px 0 rgba(255,255,255,0.06);
                animation: slideIn 0.35s cubic-bezier(0.4, 0, 0.2, 1) forwards;
                pointer-events: auto;
                white-space: nowrap;
              }
              .toast.out {
                animation: slideOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
              }
              .icon { display: flex; align-items: center; flex-shrink: 0; }
              .label { font-weight: 600; color: ${err ? '#ef4444' : '#22c55e'}; }
              .msg { color: #e5e5ea; }
            </style>
            <div class="toast">
              <span class="icon">${icon}</span>
              <span class="label">${err ? 'Error' : 'BlackNote'}</span>
              <span class="msg">${msg}</span>
            </div>
          `;

          document.body.appendChild(host);

          setTimeout(() => {
            const toastEl = shadow.querySelector('.toast');
            if (toastEl) toastEl.classList.add('out');
            setTimeout(() => host.remove(), 300);
          }, 3500);
        },
        args: [message, isError],
      }).catch(() => {});
    }

    // ── Menu Click Handler ──
    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
      if (!tab?.id) return;

      // ── Save full page ──
      if (info.menuItemId === 'blacknote-save-full-page') {
        showPageToast(tab.id, 'Capturing page...');
        try {
          const pageData = await capturePage(tab.id);
          saveCapturedClip(pageData.title || tab.title || 'Web Clip', tab.url || '', pageData.content);
          showPageToast(tab.id, `Saved to BlackNote: ${pageData.title || tab.title}`);
        } catch (err) {
          console.error('[BlackNote] Full page capture failed:', err);
          showPageToast(tab.id, 'Failed to capture page', true);
        }
        return;
      }

      // ── Save selection ──
      if (info.menuItemId === 'blacknote-save-selection') {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const selection = window.getSelection();
              if (!selection || selection.rangeCount === 0) return null;

              const range = selection.getRangeAt(0);
              const fragment = range.cloneContents();
              const wrapper = document.createElement('div');
              wrapper.appendChild(fragment);

              const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
                .map(el => el.outerHTML).join('\n');

              const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${document.title} (selection)</title>
${styles}</head><body>${wrapper.innerHTML}</body></html>`;

              return { html, title: document.title };
            },
          });

          const selData = results?.[0]?.result;
          if (!selData?.html) throw new Error('No selection captured');

          saveCapturedClip(`${selData.title || tab.title || 'Selection'} (selection)`, tab.url || '', selData.html);
          showPageToast(tab.id, 'Selection saved to BlackNote');
        } catch (err) {
          console.error('[BlackNote] Selection capture failed:', err);
          showPageToast(tab.id, 'Failed to capture selection', true);
        }
        return;
      }

      // ── Save all tabs ──
      if (info.menuItemId === 'blacknote-save-all-tabs') {
        showPageToast(tab.id, 'Saving all tabs...');
        try {
          const currentWindow = await chrome.windows.getCurrent();
          const tabs = await chrome.tabs.query({
            windowId: currentWindow.id,
            url: ['http://*/*', 'https://*/*'],
          });

          const validTabs = tabs.filter(t => t.id && t.url);
          let savedCount = 0;

          for (const t of validTabs) {
            try {
              const pageData = await capturePage(t.id!);
              chrome.storage.local.set({
                [`singlefile_pending_clip_${t.id}`]: {
                  title: pageData.title || t.title || 'Web Clip',
                  url: t.url || '',
                  content: pageData.content,
                  timestamp: Date.now(),
                },
              });
              savedCount++;
            } catch {
              // Skip tabs that can't be captured
            }
          }

          showPageToast(tab.id, `Saved ${savedCount}/${validTabs.length} tabs to BlackNote`);
        } catch (err) {
          console.error('[BlackNote] Save all tabs failed:', err);
          showPageToast(tab.id, 'Failed to save tabs', true);
        }
        return;
      }
    });

let offscreenReadyResolver: (() => void) | null = null;
let offscreenReadyPromise: Promise<void> | null = null;

let popoutWindowId: number | null = null;

// Track when the pop-out window is closed natively (e.g. by clicking X)
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === popoutWindowId) {
    popoutWindowId = null;
    
    // Clear the active flag
    chrome.storage.local.set({ blacknote_popout_active: false });

    // Re-enable side panel opening on extension icon click
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  }
});


  // Open side panel when extension icon is clicked (default behavior)
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: Error) => console.error("Side panel setup error:", error));

  // Handle extension icon click manually when the side panel default behavior is disabled
  chrome.action.onClicked.addListener((tab) => {
    if (popoutWindowId) {
      // Focus the existing pop-out window instead of opening the side panel
      chrome.windows.update(popoutWindowId, { focused: true }).catch(console.error);
    }
  });

  // Route clip requests from sidepanel → content script in the active tab
  chrome.runtime.onMessage.addListener(
    (message: { type: string; [key: string]: any }, _sender, sendResponse) => {
      if (message.type === "REQUEST_CLIP") {
        chrome.windows.getLastFocused({ windowTypes: ['normal'] })
          .then((win) => {
            if (!win?.id) throw new Error("No normal window found");
            return chrome.tabs.query({ active: true, windowId: win.id });
          })
          .then(([tab]) => {
            if (!tab?.id) throw new Error("No active tab found");
            return chrome.tabs.sendMessage(tab.id, { type: "CLIP_PAGE" });
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
            chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);
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
        chrome.tabs.captureVisibleTab(null as any, { format: "png" }).then(async (dataUrl) => {
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
            chrome.sidePanel.open({ windowId: targetWindowId }).catch((err: any) => {
              console.warn("Failed to open sidepanel from external message:", err);
            });
          } else {
            chrome.windows.getCurrent((win) => {
              if (win && win.id) {
                chrome.sidePanel.open({ windowId: win.id }).catch((err: any) => {
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

  }
});
