import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { AI_API_BASE } from "@/lib/constants";
import { getAuthToken } from "@/lib/auth-client";
import { motion } from "framer-motion";
import { useMemo, useState, useRef, createContext, useEffect, useCallback, useContext } from "react";
import { useThread, type ThreadHistoryAdapter } from "@assistant-ui/react";

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

function PageContextCleanup() {
  const isRunning = useThread((t) => t.isRunning);
  const chatCtx = useContext(PageContext);
  const wasRunningRef = useRef(false);

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
  const chatHistoryRowsRef = useRef<any[]>([]);

  // Synchronize ref on note changes
  useEffect(() => {
    chatHistoryRowsRef.current = initialChatHistory || [];
  }, [noteId, initialChatHistory]);

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

  const historyAdapter = useMemo<ThreadHistoryAdapter>(() => {
    return {
      async load() {
        return { headId: null, messages: [] };
      },
      async append() {},
      withFormat: (fmt) => ({
        async load() {
          const rows = chatHistoryRowsRef.current;
          return {
            messages: rows.map((row: any, index: number) => {
              // Backward compatibility for old simple format { role, content }
              if (row && typeof row === "object" && "role" in row && "content" in row && typeof row.content === "string") {
                return {
                  id: row.id || `${noteId}-old-${index}`,
                  role: row.role as "user" | "assistant",
                  content: row.content,
                };
              }
              // Standard assistant-ui format
              return fmt.decode({
                id: row.id,
                parent_id: row.parent_id || null,
                format: row.format,
                content: row.content,
              });
            }),
          };
        },
        async append(item) {
          const id = fmt.getId(item.message);
          const newRow = {
            id,
            parent_id: item.parentId,
            format: fmt.format,
            content: fmt.encode(item),
          };

          const existingIndex = chatHistoryRowsRef.current.findIndex((r) => r.id === id);
          const updatedRows = [...chatHistoryRowsRef.current];

          if (existingIndex >= 0) {
            updatedRows[existingIndex] = newRow;
          } else {
            updatedRows.push(newRow);
          }

          chatHistoryRowsRef.current = updatedRows;
          if (onUpdateChatHistory) {
            onUpdateChatHistory(updatedRows);
          }
        },
      }),
    };
  }, [noteId, onUpdateChatHistory]);

  const runtime = useChatRuntime({
    transport,
    adapters: {
      history: historyAdapter,
    },
  });

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
            <PageContextCleanup />
            <Thread />
          </AssistantRuntimeProvider>
        </div>
      </motion.div>
    </PageContext.Provider>
  );
}
