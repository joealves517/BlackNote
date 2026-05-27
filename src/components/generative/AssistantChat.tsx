import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { AI_API_BASE } from "@/lib/constants";
import { getAuthToken } from "@/lib/auth-client";
import { motion } from "framer-motion";
import { useMemo, useState, useRef, createContext, useEffect, useCallback } from "react";
import { db } from "@/lib/local-db";

export interface AttachedPageContext {
  title: string;
  url: string;
  favicon: string;
  markdown: string;
}

export const PageContext = createContext<{
  noteTitle: string;
  pageContext: AttachedPageContext | null;
  setPageContext: (ctx: AttachedPageContext | null) => void;
} | null>(null);

interface AssistantChatProps {
  noteId: string;
  noteTitle: string;
  noteContent: string;
  onUpdateChatHistory?: (history: any[]) => void;
  onClose: () => void;
  show: boolean;
}

// Parse raw DB messages into the format useChat expects
function parseStoredMessages(raw: any[]): { id: string; role: "user" | "assistant"; content: string }[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((msg: any, index: number) => {
      if (!msg || typeof msg !== "object") return null;

      let textContent = "";
      let role = msg.role || "user";

      if (typeof msg.content === "string") {
        textContent = msg.content;
      } else if (msg.content && typeof msg.content === "object" && "messages" in msg.content) {
        const innerMsg = msg.content.messages[0];
        role = innerMsg?.role || role;
        textContent = innerMsg?.content?.[0]?.text || "";
      }

      return {
        id: msg.id || `msg-${index}`,
        role: (role === "assistant" ? "assistant" : "user") as "user" | "assistant",
        content: textContent,
      };
    })
    .filter((msg): msg is NonNullable<typeof msg> => msg !== null && msg.content.trim() !== "");
}

export function AssistantChat({
  noteId,
  noteTitle,
  noteContent,
  onUpdateChatHistory,
  onClose,
  show,
}: AssistantChatProps) {
  const [pageContext, setPageContextState] = useState<AttachedPageContext | null>(null);
  const pageContextRef = useRef<AttachedPageContext | null>(null);

  // Fresh messages loaded directly from IndexedDB — the single source of truth
  const [dbMessages, setDbMessages] = useState<{ id: string; role: "user" | "assistant"; content: string }[] | null>(null);

  const setPageContext = (ctx: AttachedPageContext | null) => {
    pageContextRef.current = ctx;
    setPageContextState(ctx);
  };

  // Load chat history directly from IndexedDB when noteId changes
  // This is the KEY fix — bypasses stale React state entirely
  useEffect(() => {
    let cancelled = false;

    setDbMessages(null); // Reset to trigger loading state

    db.notes.get(noteId).then((row) => {
      if (cancelled) return;

      if (row?.chatHistory) {
        try {
          const parsed = JSON.parse(row.chatHistory);
          setDbMessages(parseStoredMessages(parsed));
        } catch {
          setDbMessages([]);
        }
      } else {
        setDbMessages([]);
      }
    }).catch(() => {
      if (!cancelled) setDbMessages([]);
    });

    return () => { cancelled = true; };
  }, [noteId]);

  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: `${AI_API_BASE}/api/chat`,
        headers: async (): Promise<Record<string, string>> => {
          const token = await getAuthToken();
          return token ? { Authorization: `Bearer ${token}` } : ({} as Record<string, string>);
        },
        body: {
          noteContext: { noteId, noteTitle, noteContent },
          get pageContext() {
            return pageContextRef.current;
          },
        },
      }),
    [noteId, noteTitle, noteContent]
  );

  const runtime = useChatRuntime({
    transport,
    initialMessages: dbMessages ?? [],
  });

  // Sync messages to IndexedDB and React state on every thread change
  useEffect(() => {
    if (!runtime) return;

    let lastSavedJson = "";

    const unsubscribe = runtime.thread.subscribe(() => {
      const state = runtime.thread.getState();
      const messages = state.messages;

      if (messages.length === 0) return;

      // Build persistable history
      const history = messages
        .map((m) => {
          let textContent = "";
          if (Array.isArray(m.content)) {
            textContent = m.content
              .filter((part: any) => part.type === "text")
              .map((part: any) => part.text)
              .join("");
          } else if (typeof m.content === "string") {
            textContent = m.content;
          }
          return { id: m.id, role: m.role, content: textContent };
        })
        .filter((msg) => msg.content.trim() !== "");

      if (history.length === 0) return;

      // Deduplicate writes — only persist when data actually changes
      const historyJson = JSON.stringify(history);
      if (historyJson === lastSavedJson) return;
      lastSavedJson = historyJson;

      // Write directly to IndexedDB — instant, no debounce
      db.notes.update(noteId, {
        chatHistory: historyJson,
        updatedAt: Date.now(),
      }).catch((err) => console.error("[Chat History Save Error]:", err));

      // Update React state in parent so the note list shows correct data
      if (onUpdateChatHistory) {
        onUpdateChatHistory(history);
      }
    });

    return unsubscribe;
  }, [runtime, noteId, onUpdateChatHistory]);

  // PageContext auto-cleanup when AI finishes generation
  useEffect(() => {
    if (!runtime) return;
    let wasRunning = false;

    const unsubscribe = runtime.thread.subscribe(() => {
      const { isRunning } = runtime.thread.getState();
      if (wasRunning && !isRunning) {
        if (pageContextRef.current) {
          setPageContext(null);
        }
      }
      wasRunning = isRunning;
    });

    return unsubscribe;
  }, [runtime]);

  // Don't render until DB messages are loaded to avoid flash of empty state
  if (dbMessages === null) {
    return null;
  }

  return (
    <PageContext.Provider value={{ noteTitle, pageContext, setPageContext }}>
      <motion.div
        className="absolute inset-0 z-30 flex flex-col bg-white dark:bg-[#212121]"
        style={{ display: show ? "flex" : "none" }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: show ? 1 : 0, y: show ? 0 : 10 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <div className="flex-1 overflow-hidden flex flex-col">
          <AssistantRuntimeProvider runtime={runtime}>
            <Thread />
          </AssistantRuntimeProvider>
        </div>
      </motion.div>
    </PageContext.Provider>
  );
}
