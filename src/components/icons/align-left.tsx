"use client";

import type { Transition } from "framer-motion";
import { motion, useAnimation } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface AlignLeftIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface AlignLeftIconProps extends HTMLAttributes<HTMLDivElement> {
}

const DEFAULT_TRANSITION: Transition = {
  type: "spring",
  stiffness: 150,
  damping: 15,
  mass: 0.3,
};

const AlignLeftIcon = forwardRef<AlignLeftIconHandle, AlignLeftIconProps>(
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
          <motion.line
            animate={controls}
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { x2: 21 },
              animate: { x2: 21 },
            }}
            x1="3"
            x2="21"
            y1="6"
            y2="6"
          />

          <motion.line
            animate={controls}
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { x2: 15 },
              animate: { x2: 19 },
            }}
            x1="3"
            x2="15"
            y1="12"
            y2="12"
          />

          <motion.line
            animate={controls}
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { x2: 17 },
              animate: { x2: 12 },
            }}
            x1="3"
            x2="17"
            y1="18"
            y2="18"
          />
        </svg>
      </div>
    );
  }
);

AlignLeftIcon.displayName = "AlignLeftIcon";

export { AlignLeftIcon };
