/**
 * Chrome Built-in AI (Prompt API) wrapper.
 * Uses Gemini Nano on-device model — no API key needed, fully private.
 */

type AIAvailability = "readily" | "after-download" | "no";

interface AISession {
  prompt: (input: string) => Promise<string>;
  promptStreaming: (input: string) => AsyncIterable<string>;
  destroy: () => void;
}

let cachedSession: AISession | null = null;

export async function checkAIAvailability(): Promise<AIAvailability> {
  try {
    if (!("ai" in globalThis) || !(globalThis as any).ai?.languageModel) {
      return "no";
    }
    const availability = await (globalThis as any).ai.languageModel.availability();
    return availability as AIAvailability;
  } catch {
    return "no";
  }
}

export async function createAISession(
  systemPrompt?: string,
  onDownloadProgress?: (percent: number) => void
): Promise<AISession> {
  if (cachedSession) return cachedSession;

  const ai = (globalThis as any).ai;
  if (!ai?.languageModel) {
    throw new Error("Chrome Built-in AI is not available");
  }

  const session = await ai.languageModel.create({
    systemPrompt:
      systemPrompt ??
      "You are a helpful writing assistant embedded in a note-taking app. Be concise, clear, and helpful. Respond in the same language the user writes in.",
    monitor(m: any) {
      m.addEventListener("downloadprogress", (e: any) => {
        const percent = Math.round((e.loaded / e.total) * 100);
        onDownloadProgress?.(percent);
      });
    },
  });

  cachedSession = session;
  return session;
}

export async function promptAI(input: string): Promise<string> {
  const session = await createAISession();
  return session.prompt(input);
}

export async function* streamAI(input: string): AsyncGenerator<string> {
  const session = await createAISession();
  const stream = session.promptStreaming(input);
  for await (const chunk of stream) {
    yield chunk;
  }
}

export function destroyAISession() {
  if (cachedSession) {
    cachedSession.destroy();
    cachedSession = null;
  }
}
