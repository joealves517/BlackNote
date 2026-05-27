import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { AI_API_BASE } from "@/lib/constants";
import { getAuthToken } from "@/lib/auth-client";
import { motion } from "framer-motion";
import { useMemo, useState, useRef, createContext, useEffect, useCallback, useContext } from "react";
import { useThread } from "@assistant-ui/react";

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
}

function ChatHistorySync({
  onUpdateChatHistory,
}: {
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
    if (callbackRef.current && messages.length > 0 && messages.length !== lastSyncedCountRef.current) {
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

      callbackRef.current(history);
    }
  }, [messages]);

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

  // Stable memoization of initial messages supporting multiple history shapes
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
  }, [noteId, initialChatHistory]);

  const runtime = useChatRuntime({ 
    transport,
    initialMessages,
  });

  // Force the thread runtime to reset and populate with the correct initial messages
  // whenever the note changes or when the component is mounted!
  useEffect(() => {
    if (runtime && initialMessages) {
      runtime.thread.reset(initialMessages);
    }
  }, [noteId, initialMessages, runtime]);

  return (
    <PageContext.Provider value={{ noteTitle, pageContext, setPageContext }}>
      <motion.div
        className="absolute inset-0 z-30 flex flex-col bg-white dark:bg-[#212121]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <div className="flex-1 overflow-hidden flex flex-col">
          <AssistantRuntimeProvider runtime={runtime}>
            <ChatHistorySync onUpdateChatHistory={onUpdateChatHistory} />
            <Thread />
          </AssistantRuntimeProvider>
        </div>
      </motion.div>
    </PageContext.Provider>
  );
}
