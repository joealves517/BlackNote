"use client";

import type { Transition, Variants } from "framer-motion";
import { motion, useAnimation } from "framer-motion";
import type { HTMLAttributes } from "react";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface PinIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface PinIconProps extends HTMLAttributes<HTMLDivElement> {
  active?: boolean;
}

const SVG_VARIANTS: Variants = {
  normal: {
    rotate: 0,
  },
  animate: {
    rotate: [0, -15, 15, -8, 0],
  },
};

const SVG_TRANSITION: Transition = {
  duration: 0.6,
  ease: "easeInOut",
};

const PinIcon = forwardRef<PinIconHandle, PinIconProps>(
  ({ className, active, ...props }, ref) => {
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

      const parent = el.closest("button, a, [role=button]");
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
        <motion.svg
          animate={controls}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          transition={SVG_TRANSITION}
          variants={SVG_VARIANTS}
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          {active ? (
            <>
              {/* PinOff — return to side panel */}
              <path d="M12 17v5" />
              <path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1v2.34" />
              <path d="m2 2 20 20" />
              <path d="M17.64 12.76a2 2 0 0 1-.3 3.24H6.67a2 2 0 0 1-.3-3.24L9 10.4" />
            </>
          ) : (
            <>
              {/* Pin — pop out to always on top */}
              <path d="M12 17v5" />
              <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
            </>
          )}
        </motion.svg>
      </div>
    );
  }
);

PinIcon.displayName = "PinIcon";

export { PinIcon };
