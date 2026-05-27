import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { AI_API_BASE } from "@/lib/constants";
import { getAuthToken } from "@/lib/auth-client";
import { motion } from "framer-motion";
import { useMemo, useState, useRef, createContext, useEffect, useCallback, useContext } from "react";
import { useThread } from "@assistant-ui/react";
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
  initialChatHistory?: any[];
  onUpdateChatHistory?: (history: any[]) => void;
  onClose: () => void;
  show: boolean;
}

function ChatHistorySync({
  noteId,
  onUpdateChatHistory,
}: {
  noteId: string;
  onUpdateChatHistory?: (history: any[]) => void;
}) {
  const messages = useThread((t) => t.messages);
  const isRunning = useThread((t) => t.isRunning);
  const chatCtx = useContext(PageContext);
  const wasRunningRef = useRef(false);
  
  // Use ref to always access the latest callback without re-triggering the effect
  const callbackRef = useRef(onUpdateChatHistory);
  callbackRef.current = onUpdateChatHistory;
  
  // Track last synced message count to avoid redundant updates
  const lastSyncedCountRef = useRef(0);

  useEffect(() => {
    if (messages.length > 0 && messages.length !== lastSyncedCountRef.current) {
      lastSyncedCountRef.current = messages.length;
      
      // Parse thread messages directly and robustly to avoid external store bugs
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
          return {
            id: m.id,
            role: m.role,
            content: textContent,
          };
        })
        .filter((msg) => msg.content.trim() !== "");

      // Perform IMMEDIATE direct write to IndexedDB to bypass 400ms react state debounce
      db.notes.update(noteId, {
        chatHistory: JSON.stringify(history),
        updatedAt: Date.now()
      }).catch(err => console.error("[IndexedDB Direct Sync Error]:", err));

      if (callbackRef.current) {
        callbackRef.current(history);
      }
    }
  }, [messages, noteId]);

  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      // Stream just finished, automatically detach the page context to prevent redundant token usage
      if (chatCtx && chatCtx.pageContext) {
        chatCtx.setPageContext(null);
      }
    }
    wasRunningRef.current = isRunning;
  }, [isRunning, chatCtx]);

  return null;
}

export function AssistantChat({
  noteId,
  noteTitle,
  noteContent,
  initialChatHistory = [],
  onUpdateChatHistory,
  onClose,
  show,
}: AssistantChatProps) {
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

  // Stable initial messages - strictly bound to noteId on mount.
  // Must NOT re-trigger when initialChatHistory updates to prevent infinite feedback loops.
  const initialMessages = useMemo(() => {
    return initialChatHistory.map((msg: any, index: number) => {
      if (msg && typeof msg === "object") {
        let textContent = "";
        let role = msg.role || "user";

        // Parse content robustly
        if (typeof msg.content === "string") {
          textContent = msg.content;
        } else if (msg.content && typeof msg.content === "object" && "messages" in msg.content) {
          const innerMsg = msg.content.messages[0];
          role = innerMsg?.role || role;
          textContent = innerMsg?.content?.[0]?.text || "";
        }

        return {
          id: msg.id || `${noteId}-msg-${index}`,
          role: (role === "assistant" ? "assistant" : "user") as "user" | "assistant",
          content: textContent,
        };
      }
      return {
        id: `${noteId}-msg-${index}`,
        role: "user" as const,
        content: "",
      };
    }).filter(msg => msg.content.trim() !== "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  const runtime = useChatRuntime({ 
    transport,
    initialMessages,
  });

  // Decoupled reset mechanism: Only runs ONCE on note switch (when noteId or runtime changes).
  // Decoupled from initialMessages to avoid infinite resetting during an active chat stream.
  useEffect(() => {
    if (runtime && initialMessages) {
      runtime.thread.reset(initialMessages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, runtime]);

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
            <ChatHistorySync noteId={noteId} onUpdateChatHistory={onUpdateChatHistory} />
            <Thread />
          </AssistantRuntimeProvider>
        </div>
      </motion.div>
    </PageContext.Provider>
  );
}
