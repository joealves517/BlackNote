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

/**
 * Outer wrapper: loads chat history from IndexedDB, then renders the
 * inner ChatRuntime component ONLY after data is ready.
 *
 * This is critical because useChatRuntime -> useChat only reads
 * `initialMessages` during the very first render (via useRef).
 * If we pass [] on the first render and update later, the runtime
 * ignores the update — causing the "chat lost on note switch" bug.
 */
export function AssistantChat(props: AssistantChatProps) {
  const { noteId } = props;
  const [loadedMessages, setLoadedMessages] = useState<
    { id: string; role: "user" | "assistant"; content: string }[] | null
  >(null);

  // Load chat history fresh from IndexedDB every time noteId changes
  useEffect(() => {
    let cancelled = false;
    setLoadedMessages(null);

    db.notes
      .get(noteId)
      .then((row) => {
        if (cancelled) return;
        if (row?.chatHistory) {
          try {
            const parsed = JSON.parse(row.chatHistory);
            setLoadedMessages(parseStoredMessages(parsed));
          } catch {
            setLoadedMessages([]);
          }
        } else {
          setLoadedMessages([]);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadedMessages([]);
      });

    return () => {
      cancelled = true;
    };
  }, [noteId]);

  // Don't render the inner component until DB data is ready.
  // This guarantees useChatRuntime receives correct initialMessages on its FIRST render.
  if (loadedMessages === null) {
    return null;
  }

  return <ChatRuntime {...props} initialMessages={loadedMessages} />;
}

// ─────────────────────────────────────────────────────────────
// Inner component: only mounted AFTER initialMessages are loaded
// ─────────────────────────────────────────────────────────────

interface ChatRuntimeProps extends AssistantChatProps {
  initialMessages: { id: string; role: "user" | "assistant"; content: string }[];
}

function ChatRuntime({
  noteId,
  noteTitle,
  noteContent,
  initialMessages,
  onUpdateChatHistory,
  onClose,
  show,
}: ChatRuntimeProps) {
  const [pageContext, setPageContextState] = useState<AttachedPageContext | null>(null);
  const pageContextRef = useRef<AttachedPageContext | null>(null);

  const setPageContext = (ctx: AttachedPageContext | null) => {
    pageContextRef.current = ctx;
    setPageContextState(ctx);
  };

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

  // initialMessages is guaranteed to be the correct DB data on first render
  const runtime = useChatRuntime({
    transport,
    initialMessages,
  });

  // Sync messages to IndexedDB on every thread change
  useEffect(() => {
    if (!runtime) return;

    let lastSavedJson = "";

    const unsubscribe = runtime.thread.subscribe(() => {
      const state = runtime.thread.getState();
      const messages = state.messages;

      if (messages.length === 0) return;

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

      // Only write when data actually changed
      const historyJson = JSON.stringify(history);
      if (historyJson === lastSavedJson) return;
      lastSavedJson = historyJson;

      // Direct IndexedDB write — instant, no debounce
      db.notes
        .update(noteId, {
          chatHistory: historyJson,
          updatedAt: Date.now(),
        })
        .catch((err) => console.error("[Chat History Save Error]:", err));

      // Sync React state in parent
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
