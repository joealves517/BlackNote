import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { AI_API_BASE } from "@/lib/constants";
import { getAuthToken } from "@/lib/auth-client";
import { motion, AnimatePresence } from "framer-motion";
import { useMemo, useState, useRef, createContext, useEffect } from "react";
import { XIcon } from "lucide-react";
import { useThread, getExternalStoreMessages } from "@assistant-ui/react";

export interface AttachedPageContext {
  title: string;
  url: string;
  favicon: string;
  markdown: string;
}

export const PageContext = createContext<{
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
  
  useEffect(() => {
    if (onUpdateChatHistory && messages.length > 0) {
      // getExternalStoreMessages extracts the UIMessage[] from assistant-ui's ThreadMessage
      const vercelMessages = messages.flatMap((m) => getExternalStoreMessages(m));
      onUpdateChatHistory(vercelMessages);
    }
  }, [messages, onUpdateChatHistory]);

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
        headers: async () => {
          const token = await getAuthToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
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
    initialMessages: initialChatHistory,
  });

  return (
    <PageContext.Provider value={{ pageContext, setPageContext }}>
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
