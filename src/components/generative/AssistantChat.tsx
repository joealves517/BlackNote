import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { AI_API_BASE } from "@/lib/constants";
import { getAuthToken } from "@/lib/auth-client";
import { motion } from "framer-motion";
import { useMemo, useState, useRef, createContext, useEffect } from "react";

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
  onClose: () => void;
  show: boolean;
}

export function AssistantChat({
  noteId,
  noteTitle,
  noteContent,
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

  const runtime = useChatRuntime({ transport });

  // Auto-clear pageContext after AI finishes generating
  useEffect(() => {
    if (!runtime) return;
    let wasRunning = false;

    const unsubscribe = runtime.thread.subscribe(() => {
      const { isRunning } = runtime.thread.getState();
      if (wasRunning && !isRunning && pageContextRef.current) {
        setPageContext(null);
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
