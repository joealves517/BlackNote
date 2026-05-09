"use client";

import type { Variants } from "framer-motion";
import { motion, useAnimation } from "framer-motion";
import type { HTMLAttributes } from "react";
import React, { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface MessageSquareMoreIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface MessageSquareMoreIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const DOT_VARIANTS: Variants = {
  normal: {
    opacity: 1,
  },
  animate: (custom: number) => ({
    opacity: [1, 0, 0, 1, 1, 0, 0, 1],
    transition: {
      opacity: {
        times: [
          0,
          0.1,
          0.1 + custom * 0.1,
          0.1 + custom * 0.1 + 0.1,
          0.5,
          0.6,
          0.6 + custom * 0.1,
          0.6 + custom * 0.1 + 0.1,
        ],
        duration: 1.5,
      },
    },
  }),
};

const MessageSquareMoreIcon = forwardRef<
  MessageSquareMoreIconHandle,
  MessageSquareMoreIconProps
>(({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
  const controls = useAnimation();
  const isControlledRef = useRef(false);

  useImperativeHandle(ref, () => {
    isControlledRef.current = true;

    return {
      startAnimation: () => controls.start("animate"),
      stopAnimation: () => controls.start("normal"),
    };
  });

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) {
        onMouseEnter?.(e);
      } else {
        controls.start("animate");
      }
    },
    [controls, onMouseEnter]
  );

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isControlledRef.current) {
        onMouseLeave?.(e);
      } else {
        controls.start("normal");
      }
    },
    [controls, onMouseLeave]
  );

  // Auto-animate on hover for any parent with a button class
  const wrapperRef = useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = wrapperRef.current;
    if (!el || isControlledRef.current) return;

    const parent = el.closest("button, a, [role=button], .floating-header-btn");
    const target = parent && parent !== el ? parent : el;

    const onEnter = () => controls.start("animate");
    const onLeave = () => controls.start("normal");
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
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      <svg
        fill="none"
        height={size || "100%"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width={size || "100%"}
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <motion.path
          animate={controls}
          custom={0}
          d="M8 10h.01"
          variants={DOT_VARIANTS}
        />
        <motion.path
          animate={controls}
          custom={1}
          d="M12 10h.01"
          variants={DOT_VARIANTS}
        />
        <motion.path
          animate={controls}
          custom={2}
          d="M16 10h.01"
          variants={DOT_VARIANTS}
        />
      </svg>
    </div>
  );
});

MessageSquareMoreIcon.displayName = "MessageSquareMoreIcon";

export { MessageSquareMoreIcon };
