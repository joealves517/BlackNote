import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { AI_API_BASE } from "@/lib/constants";
import { getAuthToken } from "@/lib/auth-client";
import { motion } from "framer-motion";
import { useMemo, useState, useRef, createContext, useEffect, useCallback, useContext } from "react";
import { useChat } from "@ai-sdk/react";

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
  const [token, setToken] = useState<string | null>(null);

  // Fetch token once on mount
  useEffect(() => {
    getAuthToken().then((t) => setToken(t));
  }, []);

  const setPageContext = (ctx: AttachedPageContext | null) => {
    pageContextRef.current = ctx;
    setPageContextState(ctx);
  };

  // Convert initial history robustly supporting both raw { role, content }
  // and previously formatted thread format { id, format, content }
  const initialMessages = useMemo(() => {
    return initialChatHistory.map((msg: any, index: number) => {
      if (msg && typeof msg === "object") {
        let textContent = "";
        let role = msg.role || "user";

        // Parse content
        if (typeof msg.content === "string") {
          textContent = msg.content;
        } else if (msg.content && typeof msg.content === "object") {
          // If it was stored under assistant-ui encoding row { id, parent_id, format, content }
          if ("messages" in msg.content && Array.isArray(msg.content.messages)) {
            const innerMsg = msg.content.messages[0];
            role = innerMsg?.role || role;
            textContent = innerMsg?.content?.[0]?.text || "";
          }
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

  const chat = useChat({
    id: noteId,
    api: `${AI_API_BASE}/api/chat`,
    initialMessages,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: {
      noteContext: { noteId, noteTitle, noteContent },
      get pageContext() {
        return pageContextRef.current;
      },
    },
  });

  const runtime = useAISDKRuntime(chat);

  const messages = chat.messages;
  const isRunning = chat.isLoading;
  const wasRunningRef = useRef(false);

  // Auto-sync active chat messages to note DB
  useEffect(() => {
    if (onUpdateChatHistory && messages.length > 0) {
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

      onUpdateChatHistory(history);
    }
  }, [messages, onUpdateChatHistory]);

  // Clean up Page Context when generation ends
  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      if (pageContextRef.current) {
        setPageContext(null);
      }
    }
    wasRunningRef.current = isRunning;
  }, [isRunning]);

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
            <Thread />
          </AssistantRuntimeProvider>
        </div>
      </motion.div>
    </PageContext.Provider>
  );
}
