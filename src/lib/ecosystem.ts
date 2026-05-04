/**
 * Cross-Extension Ecosystem Registry
 * IDs and metadata for sister extensions in the GraphosAI suite.
 *
 * All cross-extension messages are relayed through the background script
 * because WXT's webextension-polyfill overrides chrome.runtime.sendMessage
 * in sidepanel context, breaking external extension addressing.
 */

export const ECOSYSTEM = {
  SPARK_AI: {
    ids: ["jaddgjjhbekcjdpmoglkeakpihbmgiah", "cainihlnefiebaigcjiniandhodkajaj"],
    name: "Spark AI",
    storeUrl:
      "https://chromewebstore.google.com/detail/spark-ai/jaddgjjhbekcjdpmoglkeakpihbmgiah",
  },
  AI_RECORDER: {
    ids: ["imhihgooenkgfnmklplobjmnglalaomm", "hmpblhofhafggbbnihgfmdjecedleiai"],
    name: "AI Screen Recorder",
    storeUrl:
      "https://chromewebstore.google.com/detail/ai-screen-recorder/imhihgooenkgfnmklplobjmnglalaomm",
  },
} as const;

let cachedWindowId: number | undefined;
// Pre-fetch window ID so it's synchronously available during user clicks
if (typeof window !== "undefined" && window.chrome?.windows) {
  window.chrome.windows.getCurrent((win) => {
    cachedWindowId = win.id;
  });
}

/**
 * Relay a message to an external extension directly.
 * We must send directly from the sidepanel context to preserve the user gesture.
 * If we route it through the background script, the gesture is lost and
 * the target extension won't be able to open its sidepanel.
 */
function relayToExternal(
  extensionIds: readonly string[],
  message: Record<string, unknown>
): Promise<any> {
  return new Promise((resolve) => {
    // Inject synchronous windowId so target doesn't lose gesture doing async lookups
    const payload = { ...message, windowId: cachedWindowId };
    
    let currentIndex = 0;
    const tryNextId = () => {
      if (currentIndex >= extensionIds.length) {
        resolve(null);
        return;
      }

      const currentId = extensionIds[currentIndex];
      try {
        // Use window.chrome to bypass WXT polyfill issues
        window.chrome.runtime.sendMessage(currentId, payload, (response) => {
          if (window.chrome.runtime.lastError) {
            currentIndex++;
            tryNextId();
          } else {
            resolve(response);
          }
        });
      } catch (e) {
        currentIndex++;
        tryNextId();
      }
    };

    tryNextId();
  });
}

/**
 * Send page content to Spark AI using SET_EXTERNAL_CONTEXT pattern.
 * Returns true if delivered, false if Spark AI is not installed.
 */
export async function openSparkAIWithPageContent(
  content: string,
  title: string,
  url?: string,
): Promise<boolean> {
  const response = await relayToExternal(ECOSYSTEM.SPARK_AI.ids, {
    type: "SET_EXTERNAL_CONTEXT",
    payload: { appName: "BlackNote", content, title, url },
  });
  return response?.success === true;
}

/**
 * Send note context to Spark AI for "Chat with Note".
 */
export async function openSparkAIWithContext(
  content: string,
  title: string
): Promise<boolean> {
  const response = await relayToExternal(ECOSYSTEM.SPARK_AI.ids, {
    type: "SET_EXTERNAL_CONTEXT",
    payload: { appName: "BlackNote", content, title },
  });
  return response?.success === true;
}

/**
 * Open a URL in a new tab via the background script.
 * Sidepanel context cannot call chrome.tabs.create directly.
 */
export function openUrlViaBackground(url: string): void {
  chrome.runtime.sendMessage({ type: "OPEN_URL", url });
}
