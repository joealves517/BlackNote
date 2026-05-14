import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { motion, AnimatePresence } from "framer-motion";
import { SparklesIcon } from "@/components/icons/sparkles";
import { ArrowUpIcon } from "@/components/icons/arrow-up";
import { getAuthToken } from "@/lib/auth-client";
import { AI_API_BASE } from "@/lib/constants";
import { useEditor } from "novel";
import TurndownService from "turndown";
import { marked } from "marked";

export function AgentInput() {
  const [isOpen, setIsOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { editor } = useEditor();

  useEffect(() => {
    getAuthToken().then(setToken);
  }, []);

  const getEditorContent = () => {
    if (!editor) return "";
    const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
    return turndown.turndown(editor.getHTML());
  };

  const [localInput, setLocalInput] = useState("");

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/ai/agent",
      fetch: async (url, options) => {
        const currentToken = await getAuthToken();
        const endpoint = `${AI_API_BASE}/api/ai/agent`;
        const headers = {
          ...options?.headers,
          ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {})
        };
        
        const parsedBody = JSON.parse(options?.body as string);
        parsedBody.documentContext = getEditorContent();

        return fetch(endpoint, {
          ...options,
          headers,
          body: JSON.stringify(parsedBody)
        });
      }
    }),
    onToolCall: ({ toolCall }) => {
      console.log("Agent called tool:", toolCall.toolName, (toolCall as any).args || (toolCall as any).input);

      if (!editor) return;

      if (toolCall.toolName === "applyFormatting") {
        const { color, bold, italic, align } = ((toolCall as any).args || (toolCall as any).input) as any;
        let chain = editor.chain().focus().selectAll();

        if (color) {
          if (color === "default") {
            chain = chain.unsetColor();
          } else {
            chain = chain.setColor(color);
          }
        }
        if (bold) chain = chain.setBold();
        if (italic) chain = chain.setItalic();
        if (align) chain = chain.setTextAlign(align);

        chain.run();
        editor.chain().focus().setTextSelection(editor.state.selection.to).run();
      }

      if (toolCall.toolName === "replaceText") {
        const { newContent } = ((toolCall as any).args || (toolCall as any).input) as any;
        const html = marked.parse(newContent, { breaks: true, gfm: true }) as string;
        editor.commands.setContent(html, true);
      }

      if (toolCall.toolName === "insertBlocks") {
        const { content } = ((toolCall as any).args || (toolCall as any).input) as any;
        const html = marked.parse(content, { breaks: true, gfm: true }) as string;
        const pos = editor.state.doc.content.size;
        editor.chain().focus().insertContentAt(pos, "\n" + html).run();
      }

      setIsOpen(false);
    }
  });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!editor) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="w-80 sm:w-96 bg-background border border-border/40 shadow-xl rounded-xl overflow-hidden p-2 backdrop-blur-xl"
            style={{
              boxShadow: "0 10px 40px -10px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.05) inset"
            }}
          >
            <form onSubmit={(e) => {
              e.preventDefault();
              if (!localInput.trim() || isLoading) return;
              sendMessage({ role: "user", content: localInput });
              setLocalInput("");
            }} className="flex flex-col gap-2">
              <div className="px-2 py-1 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <SparklesIcon className="w-3.5 h-3.5 text-primary" />
                  Agentic Editor
                </span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  Esc
                </button>
              </div>
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={localInput}
                  onChange={(e) => setLocalInput(e.target.value)}
                  placeholder="e.g. Make it colorful, Fix spelling..."
                  className="w-full bg-muted/30 border border-transparent focus:border-primary/30 rounded-lg px-3 py-2.5 text-sm text-foreground outline-none transition-colors"
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setIsOpen(false);
                  }}
                />
                <button
                  type="submit"
                  disabled={!localInput.trim() || isLoading}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 bg-primary text-primary-foreground rounded-md flex items-center justify-center shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ArrowUpIcon className="w-3.5 h-3.5" />
                </button>
              </div>

              {isLoading && (
                <div className="px-2 pb-1 text-xs text-primary animate-pulse flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  Agent is thinking...
                </div>
              )}
              {error && (
                <div className="px-2 pb-1 text-xs text-red-500">
                  Error: {error.message}
                </div>
              )}
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="w-12 h-12 bg-primary text-primary-foreground rounded-full shadow-xl flex items-center justify-center outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        style={{
          background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary)/0.8) 100%)",
        }}
      >
        <SparklesIcon className="w-6 h-6" />
      </motion.button>
    </div>
  );
}
