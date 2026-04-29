"use client";

import type { Variants } from "framer-motion";
import { motion, useAnimation } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface LanguagesIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface LanguagesIconProps extends HTMLAttributes<HTMLDivElement> {
}

const PATH_VARIANTS: Variants = {
  normal: { opacity: 1, pathLength: 1, pathOffset: 0 },
  animate: (custom: number) => ({
    opacity: [0, 1],
    pathLength: [0, 1],
    pathOffset: [1, 0],
    transition: {
      opacity: { duration: 0.01, delay: custom * 0.1 },
      pathLength: {
        type: "spring",
        duration: 0.5,
        bounce: 0,
        delay: custom * 0.1,
      },
    },
  }),
};

const SVG_VARIANTS: Variants = {
  normal: { opacity: 1 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const LanguagesIcon = forwardRef<LanguagesIconHandle, LanguagesIconProps>(
  ({ className, ...props }, ref) => {
    const svgControls = useAnimation();
    const pathControls = useAnimation();

    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;

      return {
        startAnimation: () => {
          svgControls.start("animate");
          pathControls.start("animate");
        },
        stopAnimation: () => {
          svgControls.start("normal");
          pathControls.start("normal");
        },
      };
    });
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const el = wrapperRef.current;
      if (!el || isControlledRef.current) return;

      const parent = el.closest("button, a, [role=button], .novel-slash-item, .ai-cmd-item, .floating-header-btn, .web-clipper-action-btn, .account-popup-action-btn, .identity-pill");
      const target = parent && parent !== el ? parent : el;

      const onEnter = () => { svgControls.start("animate"); pathControls.start("animate"); };
      const onLeave = () => { svgControls.start("normal"); pathControls.start("normal"); };
      target.addEventListener("pointerenter", onEnter);
      target.addEventListener("pointerleave", onLeave);
      return () => {
        target.removeEventListener("pointerenter", onEnter);
        target.removeEventListener("pointerleave", onLeave);
      };
    }, [svgControls, pathControls]);

    return (
      <div
        ref={wrapperRef}
        className={cn("inline-flex items-center justify-center", className)}
        {...props}
      >
        <motion.svg
          animate={svgControls}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          variants={SVG_VARIANTS}
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.path
            animate={pathControls}
            custom={3}
            d="m5 8 6 6"
            variants={PATH_VARIANTS}
          />
          <motion.path
            animate={pathControls}
            custom={2}
            d="m4 14 6-6 3-3"
            variants={PATH_VARIANTS}
          />
          <motion.path
            animate={pathControls}
            custom={1}
            d="M2 5h12"
            variants={PATH_VARIANTS}
          />
          <motion.path
            animate={pathControls}
            custom={0}
            d="M7 2h1"
            variants={PATH_VARIANTS}
          />
          <motion.path
            animate={pathControls}
            custom={3}
            d="m22 22-5-10-5 10"
            variants={PATH_VARIANTS}
          />
          <motion.path
            animate={pathControls}
            custom={3}
            d="M14 18h6"
            variants={PATH_VARIANTS}
          />
        </motion.svg>
      </div>
    );
  }
);

LanguagesIcon.displayName = "LanguagesIcon";

export { LanguagesIcon };
