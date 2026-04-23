import { EditorBubble, removeAIHighlight, useEditor } from "novel";
import { type ReactNode, useEffect, useState, Fragment } from "react";
import { Sparkles } from "lucide-react";
import { AISelector } from "./AISelector";
import { GeminiIcon } from "./GeminiIcon";

interface GenerativeMenuSwitchProps {
  children: ReactNode;
}

export function GenerativeMenuSwitch({ children }: GenerativeMenuSwitchProps) {
  const { editor } = useEditor();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open && editor) removeAIHighlight(editor);
  }, [open, editor]);

  return (
    <EditorBubble
      tippyOptions={{
        placement: open ? "bottom-start" : "top",
        animation: false,
        duration: 0,
        popperOptions: {
          modifiers: [
            { name: "flip", enabled: true },
            { name: "preventOverflow", enabled: true, options: { padding: 8 } },
          ],
        },
        onHidden: () => {
          setOpen(false);
          if (editor) removeAIHighlight(editor);
        },
      }}
      className={open ? "ai-bubble-open" : "novel-bubble-menu"}
    >
      {open && <AISelector open={open} onOpenChange={setOpen} />}
      {!open && (
        <Fragment>
          <button
            className="ai-ask-btn"
            onClick={() => setOpen(true)}
          >
            <GeminiIcon className="h-4 w-4" />
            <span>Ask AI</span>
          </button>
          <div className="novel-bubble-divider" />
          {children}
        </Fragment>
      )}
    </EditorBubble>
  );
}
