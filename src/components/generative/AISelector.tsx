import { ArrowUpIcon } from "@/components/icons/arrow-up";
import { useEditor, removeAIHighlight } from "novel";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { createPortal } from "react-dom";
import { DOMSerializer } from "prosemirror-model";
import TurndownService from "turndown";
import { AISelectorCommands } from "./AISelectorCommands";
import { getAuthToken } from "@/lib/auth-client";
import { AI_API_BASE } from "@/lib/constants";
import { markdownToProsemirror } from "@/lib/markdown-to-prosemirror";
import { showAILoaderToast, updateAISuccessToast, updateAIErrorToast } from "@/lib/toast";

interface AISelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FEATURE_LABELS: Record<string, { title: string; loading: string; success: string }> = {
  improve: { title: "Improve Writing", loading: "Improving writing flow and clarity...", success: "Improved writing applied directly." },
  fix: { title: "Fix Grammar", loading: "Correcting spelling and grammar...", success: "Corrected text applied directly." },
  shorter: { title: "Make Shorter", loading: "Condensing text...", success: "Condensed text applied directly." },
  longer: { title: "Make Longer", loading: "Expanding text with details...", success: "Expanded text applied directly." },
  translate: { title: "Translate Text", loading: "Translating text...", success: "Translation applied directly." },
  todo: { title: "To-do List", loading: "Extracting to-dos and action items...", success: "To-do list inserted directly below." },
  continue: { title: "Continue Writing", loading: "Continuing writing from cursor...", success: "Continuation text inserted directly below." },
  zap: { title: "Ask AI", loading: "Processing prompt...", success: "Applied AI edits directly." },
};

export function AISelector({ onOpenChange }: AISelectorProps) {
  const { editor } = useEditor();
  const [inputValue, setInputValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea without scrolling — prevents editor jump
  useEffect(() => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const getSelectedText = (): string => {
    if (!editor) return "";
    const slice = editor.state.selection.content();
    const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
    
    // Disable escaping so 1. stays 1. and ** stays **
    turndown.escape = (text) => text;

    if (slice.size === 0) {
      return turndown.turndown(editor.getHTML());
    }

    try {
      const dom = DOMSerializer.fromSchema(editor.schema).serializeFragment(slice.content);
      const div = document.createElement("div");
      div.appendChild(dom);

      const children = Array.from(div.children);
      if (children.length > 0 && children.every(c => c.nodeName === "LI")) {
        const ul = document.createElement("ul");
        children.forEach(c => ul.appendChild(c));
        div.innerHTML = "";
        div.appendChild(ul);
      }

      return turndown.turndown(div.innerHTML);
    } catch {
      return slice.content.textBetween(0, slice.content.size, "\n\n");
    }
  };

  const handleClose = () => {
    if (editor) {
      removeAIHighlight(editor);
      editor.commands.focus();
    }
    onOpenChange(false);
  };

  const handleAIAction = useCallback(async (option: string, overrideText?: string) => {
    if (!editor) return;

    const toastId = `ai-selector-toast-${Date.now()}`;
    const labels = FEATURE_LABELS[option] || FEATURE_LABELS.zap;

    // Capture selection position before closing the sheet
    const { from, to } = editor.state.selection;
    const isSelectionEmpty = from === to;
    const textToProcess = overrideText ?? getSelectedText();

    handleClose(); // Close sheet immediately!

    showAILoaderToast(toastId, labels.title, labels.loading);

    try {
      const token = await getAuthToken();
      const endpoint = token ? `${AI_API_BASE}/api/ai` : `${AI_API_BASE}/api/ai/free`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          prompt: textToProcess,
          option,
          command: option === "zap" ? inputValue : undefined
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI error (${response.status}): ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      let result = "";
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += decoder.decode(value, { stream: true });
      }

      if (result.includes("We are facing high traffic") || result.includes("You have reached your daily limit")) {
        throw new Error(result.trim());
      }

      const cleanResult = result.trim();
      if (!cleanResult) {
        throw new Error("Received empty response from AI");
      }

      // Convert result to Prosemirror nodes
      let parsedContent: any;
      try {
        const jsonStr = markdownToProsemirror(cleanResult);
        const json = JSON.parse(jsonStr);
        parsedContent = json.content || cleanResult;
      } catch {
        parsedContent = cleanResult;
      }

      // Apply changes directly to editor
      if (option === "continue" || option === "todo" || isSelectionEmpty) {
        // Insert below
        editor.chain().focus().insertContentAt(to, parsedContent).run();
      } else {
        // Replace selection
        editor.chain().focus().insertContentAt({ from, to }, parsedContent).run();
      }

      updateAISuccessToast(toastId, labels.title, labels.success);

    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI request failed";
      console.error("[AISelector] Error:", msg);
      if (msg.includes("402") || msg.includes("insufficient") || msg.includes("401")) {
        window.dispatchEvent(new CustomEvent("ai-error"));
      }
      updateAIErrorToast(toastId, labels.title, msg.includes("traffic") || msg.includes("limit") ? msg : "Please try again later.");
    }
  }, [editor, inputValue]);

  // Auto-resize textarea to fit content
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => {
    autoResize();
  }, [inputValue, autoResize]);

  const portalTarget = document.getElementById("blacknote-root") || document.body;

  return createPortal(
    <>
      <motion.div
        className="history-sheet-backdrop"
        onClick={handleClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />

      <motion.div
        className="clipper-sheet"
        style={{ maxHeight: "calc(100% - 56px)" }}
        initial={{ bottom: "-100%" }}
        animate={{ bottom: 0 }}
        exit={{ bottom: "-100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 350, mass: 0.8 }}
      >
        <div className="history-sheet-handle" onClick={handleClose}>
          <div className="history-sheet-handle-bar" />
        </div>

        <motion.div
          className="clipper-sheet-content"
          style={{ display: "flex", flexDirection: "column" }}
        >
          <div className="ai-input-row">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              rows={1}
              placeholder="Ask AI to edit, translate, summarize..."
              className="ai-input"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && inputValue.trim()) {
                  e.preventDefault();
                  handleAIAction("zap");
                }
              }}
            />
            <button
              className="ai-send-btn"
              onClick={() => handleAIAction("zap")}
              disabled={!inputValue.trim()}
            >
              <ArrowUpIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          <AISelectorCommands
            onSelect={(option, overrideText) => {
              handleAIAction(option, overrideText);
            }}
          />
        </motion.div>
      </motion.div>
    </>,
    portalTarget
  );
}
