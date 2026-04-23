import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

type Placement = "top" | "bottom";

interface TooltipState {
  x: number;
  y: number;
  placement: Placement;
}

const TOOLTIP_GAP = 6;
const TOOLTIP_HEIGHT_ESTIMATE = 28;

/**
 * Global custom tooltip that intercepts `data-tooltip` attributes
 * and renders a modern, styled tooltip with smart viewport positioning.
 */
export function GlobalTooltip() {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<TooltipState>({ x: 0, y: 0, placement: "top" });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeEl = useRef<HTMLElement | null>(null);

  const show = useCallback((el: HTMLElement, title: string) => {
    const rect = el.getBoundingClientRect();
    const viewportW = window.innerWidth;

    // Decide placement: prefer top, fallback to bottom if clipped
    const spaceAbove = rect.top;
    const placement: Placement =
      spaceAbove < TOOLTIP_HEIGHT_ESTIMATE + TOOLTIP_GAP ? "bottom" : "top";

    const y = placement === "top" ? rect.top : rect.bottom;

    // Clamp horizontal center within viewport
    const x = Math.max(40, Math.min(rect.left + rect.width / 2, viewportW - 40));

    setState({ x, y, placement });
    setText(title);
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setVisible(false);
    setText("");
    activeEl.current = null;
  }, []);

  useEffect(() => {
    const handleMouseOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest("[data-tooltip]") as HTMLElement | null;

      if (!target) {
        if (activeEl.current) hide();
        return;
      }

      if (target === activeEl.current) return;

      hide();
      const title = target.getAttribute("data-tooltip") || "";
      if (!title) return;

      activeEl.current = target;
      timerRef.current = setTimeout(() => show(target, title), 500);
    };

    const handleMouseOut = (e: MouseEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      if (activeEl.current && !activeEl.current.contains(relatedTarget)) {
        hide();
      }
    };

    const handleScroll = () => hide();

    document.addEventListener("mouseover", handleMouseOver, true);
    document.addEventListener("mouseout", handleMouseOut, true);
    document.addEventListener("scroll", handleScroll, true);

    return () => {
      document.removeEventListener("mouseover", handleMouseOver, true);
      document.removeEventListener("mouseout", handleMouseOut, true);
      document.removeEventListener("scroll", handleScroll, true);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [show, hide]);

  if (!visible || !text) return null;

  const isTop = state.placement === "top";

  return createPortal(
    <div
      className={`custom-tooltip ${isTop ? "custom-tooltip-top" : "custom-tooltip-bottom"}`}
      style={{
        left: `${state.x}px`,
        top: `${state.y}px`,
      }}
    >
      {text}
    </div>,
    document.body
  );
}
