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

/**
 * Relay a message to an external extension via background service worker.
 * Background context bypasses WXT polyfill issues with external messaging.
 */
function relayToExternal(
  extensionIds: readonly string[],
  message: Record<string, unknown>
): Promise<any> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "RELAY_EXTERNAL", targetExtensionIds: extensionIds, payload: message },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response);
      }
    );
  });
}

/**
 * Send a command to Spark AI to chat about the current page.
 * Returns true if delivered, false if Spark AI is not installed.
 * Note: Spark AI cannot auto-open its sidepanel (Chrome API limitation).
 */
export async function openSparkAI(
  prompt?: string,
  url?: string,
  title?: string
): Promise<boolean> {
  const response = await relayToExternal(ECOSYSTEM.SPARK_AI.ids, {
    type: "CHAT_WITH_CONTENT",
    payload: { prompt, url, title },
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
