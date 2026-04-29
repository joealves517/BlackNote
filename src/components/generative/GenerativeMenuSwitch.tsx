import { useState, useEffect, type ReactNode, Fragment } from "react";
import { EditorBubble } from "novel";
import { SparklesIcon } from "@/components/icons/sparkles";

interface GenerativeMenuSwitchProps {
  children: ReactNode;
}

export function GenerativeMenuSwitch({ children }: GenerativeMenuSwitchProps) {
  const [isAiSheetOpen, setIsAiSheetOpen] = useState(false);

  useEffect(() => {
    const handleOpen = () => setIsAiSheetOpen(true);
    const handleClose = () => setIsAiSheetOpen(false);

    window.addEventListener("open-ai-sheet", handleOpen);
    window.addEventListener("ai-sheet-closed", handleClose);

    return () => {
      window.removeEventListener("open-ai-sheet", handleOpen);
      window.removeEventListener("ai-sheet-closed", handleClose);
    };
  }, []);

  return (
    <EditorBubble
      tippyOptions={{
        placement: "top",
        animation: false,
        duration: 0,
        popperOptions: {
          modifiers: [
            { name: "flip", enabled: true },
            { name: "preventOverflow", enabled: true, options: { padding: 8 } },
          ],
        },
      }}
      className={`novel-bubble-menu ${isAiSheetOpen ? "!hidden" : ""}`}
    >
      <Fragment>
        <button
          className="ai-ask-btn"
          onClick={() => {
            // Dispatch event to App.tsx — same pattern as History/Clipper
            window.dispatchEvent(new CustomEvent("open-ai-sheet"));
          }}
        >
          <SparklesIcon className="h-4 w-4" />
          <span>Ask AI</span>
        </button>
        <div className="novel-bubble-divider" />
        {children}
      </Fragment>
    </EditorBubble>
  );
}
