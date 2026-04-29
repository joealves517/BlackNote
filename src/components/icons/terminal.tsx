"use client";

import type { Variants } from "framer-motion";
import { motion, useAnimation } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface TerminalIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface TerminalIconProps extends HTMLAttributes<HTMLDivElement> {
}

const LINE_VARIANTS: Variants = {
  normal: { opacity: 1 },
  animate: {
    opacity: [1, 0, 1],
    transition: {
      duration: 0.8,
      repeat: Number.POSITIVE_INFINITY,
      ease: "linear",
    },
  },
};

const TerminalIcon = forwardRef<TerminalIconHandle, TerminalIconProps>(
  ({ className, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;

      return {
        startAnimation: () => controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const el = wrapperRef.current;
      if (!el || isControlledRef.current) return;

      const parent = el.closest("button, a, [role=button], .novel-slash-item, .ai-cmd-item, .floating-header-btn, .web-clipper-action-btn, .account-popup-action-btn, .identity-pill");
      const target = parent && parent !== el ? parent : el;

      const onEnter = () => { controls.start("animate"); };
      const onLeave = () => { controls.start("normal"); };
      target.addEventListener("pointerenter", onEnter);
      target.addEventListener("pointerleave", onLeave);
      return () => {
        target.removeEventListener("pointerenter", onEnter);
        target.removeEventListener("pointerleave", onLeave);
      };
    }, [controls]);

    return (
      <div
        ref={wrapperRef}
        className={cn("inline-flex items-center justify-center", className)}
        {...props}
      >
        <svg
          className="w-full h-full"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polyline points="4 17 10 11 4 5" />
          <motion.line
            animate={controls}
            initial="normal"
            variants={LINE_VARIANTS}
            x1="12"
            x2="20"
            y1="19"
            y2="19"
          />
        </svg>
      </div>
    );
  }
);

TerminalIcon.displayName = "TerminalIcon";

export { TerminalIcon };
