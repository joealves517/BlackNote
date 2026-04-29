"use client";

import type { Variants } from "framer-motion";
import { motion, useAnimation } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface GripIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface GripIconProps extends HTMLAttributes<HTMLDivElement> {
  /** When true, the animation loops continuously (for loading states) */
  loop?: boolean;
}

const CIRCLES = [
  { cx: 19, cy: 5 },
  { cx: 19, cy: 12 },
  { cx: 12, cy: 5 },
  { cx: 19, cy: 19 },
  { cx: 12, cy: 12 },
  { cx: 5, cy: 5 },
  { cx: 12, cy: 19 },
  { cx: 5, cy: 12 },
  { cx: 5, cy: 19 },
];

const VARIANTS: Variants = {
  normal: {
    opacity: 1,
    transition: { duration: 0.25 },
  },
  animate: (index: number) => ({
    opacity: [1, 0.3, 0.3, 1],
    transition: {
      delay: index * 0.07,
      duration: 1.1,
      times: [0, 0.2, 0.8, 1],
    },
  }),
};

const GripIcon = forwardRef<GripIconHandle, GripIconProps>(
  ({ className, loop = false, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);
    const isAnimatingRef = useRef(false);
    const loopRef = useRef(loop);

    // Keep loopRef in sync
    useEffect(() => {
      loopRef.current = loop;
    }, [loop]);

    const runAnimation = useCallback(async () => {
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;
      do {
        await controls.start("animate");
        await controls.start("normal");
      } while (loopRef.current);
      isAnimatingRef.current = false;
    }, [controls]);

    const stopAnimation = useCallback(async () => {
      loopRef.current = false;
      isAnimatingRef.current = false;
      await controls.start("normal");
    }, [controls]);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return { startAnimation: runAnimation, stopAnimation };
    });

    // Auto-start loop when `loop` prop is true
    useEffect(() => {
      if (loop) {
        runAnimation();
      } else {
        stopAnimation();
      }
    }, [loop, runAnimation, stopAnimation]);

    // Parent-aware hover (only when not in loop mode)
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const el = wrapperRef.current;
      if (!el || isControlledRef.current || loop) return;

      const parent = el.closest("button, a, [role=button], .novel-slash-item, .ai-cmd-item, .floating-header-btn, .web-clipper-action-btn, .account-popup-action-btn, .identity-pill");
      const target = parent && parent !== el ? parent : el;

      const onEnter = () => runAnimation();
      const onLeave = () => stopAnimation();
      target.addEventListener("pointerenter", onEnter);
      target.addEventListener("pointerleave", onLeave);
      return () => {
        target.removeEventListener("pointerenter", onEnter);
        target.removeEventListener("pointerleave", onLeave);
      };
    }, [controls, loop, runAnimation, stopAnimation]);

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
          {CIRCLES.map((circle, index) => (
            <motion.circle
              animate={controls}
              custom={index}
              cx={circle.cx}
              cy={circle.cy}
              initial="normal"
              key={`${circle.cx}-${circle.cy}`}
              r="1"
              variants={VARIANTS}
            />
          ))}
        </svg>
      </div>
    );
  }
);

GripIcon.displayName = "GripIcon";
export { GripIcon };
