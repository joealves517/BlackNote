"use client";

import type { Transition } from "framer-motion";
import { motion, useAnimation } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface VideoIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface VideoIconProps extends HTMLAttributes<HTMLDivElement> {
}

const DEFAULT_TRANSITION: Transition = {
  type: "spring",
  stiffness: 160,
  damping: 17,
  mass: 1,
};

const VideoIcon = forwardRef<VideoIconHandle, VideoIconProps>(
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
          <motion.path
            animate={controls}
            transition={DEFAULT_TRANSITION}
            variants={{
              animate: { pathLength: [0, 1], opacity: [0, 1], transition: { duration: 0.5 } },
              normal: { pathLength: 1, opacity: 1 },
            }}
            d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"
          />
          <motion.rect
            animate={controls}
            transition={DEFAULT_TRANSITION}
            variants={{
              animate: { scale: [1, 1.1, 1], transition: { duration: 0.4 } },
              normal: { scale: 1 },
            }}
            x="2"
            y="6"
            width="14"
            height="12"
            rx="2"
          />
        </svg>
      </div>
    );
  }
);

VideoIcon.displayName = "VideoIcon";

export { VideoIcon };
