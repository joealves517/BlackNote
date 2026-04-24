import { useCompletion } from "@ai-sdk/react";
import { ArrowUp } from "lucide-react";
import { useEditor, addAIHighlight, removeAIHighlight } from "novel";
import { useState, useEffect } from "react";
import Markdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { AISelectorCommands } from "./AISelectorCommands";
import { AICompletionCommands } from "./AICompletionCommands";
import { GeminiIcon } from "./GeminiIcon";
import { supabase } from "@/lib/supabase";
import { AI_API_BASE } from "@/lib/constants";

interface AISelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ThinkingDots() {
  const [dotCount, setDotCount] = useState(1);
  useEffect(() => {
    const timer = setInterval(() => {
      setDotCount((prev) => (prev % 3) + 1);
    }, 400);
    return () => clearInterval(timer);
  }, []);
  return <span className="ai-thinking-dots">{".".repeat(dotCount)}</span>;
}

export function AISelector({ onOpenChange }: AISelectorProps) {
  const { editor } = useEditor();
  const [inputValue, setInputValue] = useState("");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token || null);
    });
  }, []);

  const { completion, complete, isLoading } = useCompletion({
    api: token ? `${AI_API_BASE}/api/ai` : `${AI_API_BASE}/api/ai/free`,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    streamProtocol: "text",
    onError: (err: Error) => {
      console.error("AI error:", err.message);
      window.dispatchEvent(new CustomEvent("ai-error"));
    },
    onFinish: (_prompt, comp) => {
      if (comp.includes("Your credit has been refunded")) {
        window.dispatchEvent(new CustomEvent("ai-error-refunded"));
      } else if (comp.includes("⚠️ AI is currently busy")) {
        window.dispatchEvent(new CustomEvent("ai-error"));
      }
    },
  });

  const hasCompletion = completion.length > 0;

  const getSelectedText = (): string => {
    if (!editor) return "";
    const slice = editor.state.selection.content();
    return (
      editor.storage.markdown?.serializer?.serialize(slice.content) ||
      slice.content.textBetween(0, slice.content.size, "\n")
    );
  };

  const handleSubmit = () => {
    if (completion) {
      complete(completion, {
        body: { option: "zap", command: inputValue },
      }).then(() => setInputValue(""));
      return;
    }
    const text = getSelectedText();
    complete(text, {
      body: { option: "zap", command: inputValue },
    }).then(() => setInputValue(""));
  };

  // Determine current visual state for morph animation
  const visualState = isLoading && !hasCompletion
    ? "thinking"
    : hasCompletion
      ? "result"
      : "menu";

  return (
    <div className="ai-selector">
      <AnimatePresence mode="wait" initial={false}>
        {visualState === "thinking" && (
          <motion.div
            key="thinking"
            className="ai-loading"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          >
            <GeminiIcon className="ai-loading-icon" />
            <span>AI is thinking<ThinkingDots /></span>
          </motion.div>
        )}

        {visualState === "result" && (
          <motion.div
            key="result"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* AI response preview */}
            <div className="ai-response-preview">
              <div className="ai-response-content">
                <Markdown>{completion}</Markdown>
              </div>
            </div>

            {/* Streaming thinking indicator */}
            {isLoading && (
              <div className="ai-loading ai-loading-inline">
                <GeminiIcon className="ai-loading-icon" />
                <span>Writing<ThinkingDots /></span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input + commands — always visible when not in pure thinking state */}
      {visualState !== "thinking" && (
        <>
          <div className="ai-input-row">
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              autoFocus
              placeholder={
                hasCompletion
                  ? "Tell AI what to do next"
                  : "Ask AI to edit or generate..."
              }
              className="ai-input"
              onFocus={() => { if (editor) addAIHighlight(editor); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <button className="ai-send-btn" onClick={handleSubmit}>
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Preset commands or completion actions */}
          {hasCompletion ? (
            <AICompletionCommands
              onDiscard={() => {
                if (editor) { removeAIHighlight(editor); editor.commands.focus(); }
                onOpenChange(false);
              }}
              completion={completion}
            />
          ) : (
            <AISelectorCommands
              onSelect={(value, option) =>
                complete(value, { body: { option } })
              }
            />
          )}
        </>
      )}
    </div>
  );
}
