"use client";

import type { Variants } from "framer-motion";
import { motion, useAnimation } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface ScanTextIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface ScanTextIconProps extends HTMLAttributes<HTMLDivElement> {
}

const FRAME_VARIANTS: Variants = {
  visible: { opacity: 1 },
  hidden: { opacity: 1 },
};

const LINE_VARIANTS: Variants = {
  visible: { pathLength: 1, opacity: 1 },
  hidden: { pathLength: 0, opacity: 0 },
};

const ScanTextIcon = forwardRef<ScanTextIconHandle, ScanTextIconProps>(
  ({ className, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;

      return {
        startAnimation: async () => {
          await controls.start((i) => ({
            pathLength: 0,
            opacity: 0,
            transition: { delay: i * 0.1, duration: 0.3 },
          }));
          await controls.start((i) => ({
            pathLength: 1,
            opacity: 1,
            transition: { delay: i * 0.1, duration: 0.3 },
          }));
        },
        stopAnimation: () => controls.start("visible"),
      };
    });

    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const el = wrapperRef.current;
      if (!el || isControlledRef.current) return;

      const parent = el.closest("button, a, [role=button], .novel-slash-item, .ai-cmd-item, .floating-header-btn, .web-clipper-action-btn, .account-popup-action-btn, .identity-pill");
      const target = parent && parent !== el ? parent : el;

      const onEnter = async () => {
        await controls.start((i) => ({
          pathLength: 0,
          opacity: 0,
          transition: { delay: i * 0.1, duration: 0.3 },
        }));
        await controls.start((i) => ({
          pathLength: 1,
          opacity: 1,
          transition: { delay: i * 0.1, duration: 0.3 },
        }));
      };
      
      const onLeave = () => {
        controls.start("visible");
      };

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
          <motion.path d="M3 7V5a2 2 0 0 1 2-2h2" variants={FRAME_VARIANTS} />
          <motion.path d="M17 3h2a2 2 0 0 1 2 2v2" variants={FRAME_VARIANTS} />
          <motion.path
            d="M21 17v2a2 2 0 0 1-2 2h-2"
            variants={FRAME_VARIANTS}
          />
          <motion.path d="M7 21H5a2 2 0 0 1-2-2v-2" variants={FRAME_VARIANTS} />
          <motion.path
            animate={controls}
            custom={0}
            d="M7 8h8"
            initial="visible"
            variants={LINE_VARIANTS}
          />
          <motion.path
            animate={controls}
            custom={1}
            d="M7 12h10"
            initial="visible"
            variants={LINE_VARIANTS}
          />
          <motion.path
            animate={controls}
            custom={2}
            d="M7 16h6"
            initial="visible"
            variants={LINE_VARIANTS}
          />
        </svg>
      </div>
    );
  }
);

ScanTextIcon.displayName = "ScanTextIcon";

export { ScanTextIcon };
