import { type ReactNode, Fragment } from "react";
import { EditorBubble } from "novel";

interface GenerativeMenuSwitchProps {
  children: ReactNode;
}

export function GenerativeMenuSwitch({ children }: GenerativeMenuSwitchProps) {
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
      className="novel-bubble-menu"
    >
      <Fragment>
        <button
          className="ai-ask-btn"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("trigger-ai-improve"));
          }}
        >
          <span style={{ fontSize: 15, lineHeight: 1, transform: "translateY(-2px)", display: "inline-block" }}>✦</span>
          <span>Improve</span>
        </button>
        <div className="novel-bubble-divider" />
        {children}
      </Fragment>
    </EditorBubble>
  );
}
