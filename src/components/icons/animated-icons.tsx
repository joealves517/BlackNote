"use client";

import { motion, useAnimation } from "framer-motion";
import { forwardRef, useCallback, useRef, type HTMLAttributes } from "react";

// Shared animated icon wrapper — handles hover start/stop
function useAnimatedIcon() {
  const controls = useAnimation();
  const isHovering = useRef(false);

  const onMouseEnter = useCallback(() => {
    isHovering.current = true;
    controls.start("animate");
  }, [controls]);

  const onMouseLeave = useCallback(() => {
    isHovering.current = false;
    controls.start("normal");
  }, [controls]);

  return { controls, onMouseEnter, onMouseLeave };
}

interface AnimatedIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

/* ─── Refresh CCW Dot (Improve writing) ─── */
export const RefreshCcwDotAnimated = forwardRef<HTMLDivElement, AnimatedIconProps>(
  ({ className, size = 16, ...props }, ref) => {
    const { controls, onMouseEnter, onMouseLeave } = useAnimatedIcon();
    return (
      <div ref={ref} className={className} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} {...props}>
        <svg fill="none" height={size} width={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <motion.g animate={controls} transition={{ type: "spring", stiffness: 250, damping: 25 }} variants={{ normal: { rotate: 0 }, animate: { rotate: -50 } }}>
            <path d="M3 2v6h6" /><path d="M21 12A9 9 0 0 0 6 5.3L3 8" /><path d="M21 22v-6h-6" /><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7" />
          </motion.g>
          <circle cx="12" cy="12" r="1" />
        </svg>
      </div>
    );
  }
);
RefreshCcwDotAnimated.displayName = "RefreshCcwDotAnimated";

/* ─── Check Check (Fix grammar) ─── */
const pathDraw = {
  normal: { opacity: 1, pathLength: 1, scale: 1, transition: { duration: 0.3 } },
  animate: (i: number) => ({
    opacity: [0, 1], pathLength: [0, 1], scale: [0.5, 1],
    transition: { duration: 0.4, delay: 0.1 * i },
  }),
};

export const CheckCheckAnimated = forwardRef<HTMLDivElement, AnimatedIconProps>(
  ({ className, size = 16, ...props }, ref) => {
    const { controls, onMouseEnter, onMouseLeave } = useAnimatedIcon();
    return (
      <div ref={ref} className={className} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} {...props}>
        <svg fill="none" height={size} width={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <motion.path d="M2 12 7 17L18 6" animate={controls} custom={0} variants={pathDraw} />
          <motion.path d="M13 16L14.5 17.5L22 10" animate={controls} custom={1} variants={pathDraw} />
        </svg>
      </div>
    );
  }
);
CheckCheckAnimated.displayName = "CheckCheckAnimated";

/* ─── Arrow Down Wide Narrow (Make shorter) ─── */
export const ArrowDownWideNarrowAnimated = forwardRef<HTMLDivElement, AnimatedIconProps>(
  ({ className, size = 16, ...props }, ref) => {
    const { controls, onMouseEnter, onMouseLeave } = useAnimatedIcon();
    return (
      <div ref={ref} className={className} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} {...props}>
        <svg fill="none" height={size} width={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <motion.g animate={controls} variants={{ normal: { y: 0 }, animate: { y: [0, 2, 0] } }} transition={{ duration: 0.4 }}>
            <path d="m3 16 4 4 4-4" /><path d="M7 20V4" />
          </motion.g>
          <motion.g animate={controls} variants={{ normal: { scaleX: 1 }, animate: { scaleX: [1, 0.8, 1] } }} transition={{ duration: 0.5 }}>
            <path d="M11 4h10" /><path d="M11 8h7" /><path d="M11 12h4" />
          </motion.g>
        </svg>
      </div>
    );
  }
);
ArrowDownWideNarrowAnimated.displayName = "ArrowDownWideNarrowAnimated";

/* ─── Wrap Text (Make longer) ─── */
export const WrapTextAnimated = forwardRef<HTMLDivElement, AnimatedIconProps>(
  ({ className, size = 16, ...props }, ref) => {
    const { controls, onMouseEnter, onMouseLeave } = useAnimatedIcon();
    return (
      <div ref={ref} className={className} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} {...props}>
        <svg fill="none" height={size} width={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M3 6h18" /><path d="M3 18h6" />
          <motion.g animate={controls} variants={{ normal: { x: 0 }, animate: { x: [0, 3, 0] } }} transition={{ duration: 0.5 }}>
            <path d="M3 12h15a3 3 0 1 1 0 6h-4" /><path d="m17 16-2 2 2 2" />
          </motion.g>
        </svg>
      </div>
    );
  }
);
WrapTextAnimated.displayName = "WrapTextAnimated";

/* ─── Languages (Translate) ─── */
export const LanguagesAnimated = forwardRef<HTMLDivElement, AnimatedIconProps>(
  ({ className, size = 16, ...props }, ref) => {
    const { controls, onMouseEnter, onMouseLeave } = useAnimatedIcon();
    return (
      <div ref={ref} className={className} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} {...props}>
        <svg fill="none" height={size} width={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <motion.g animate={controls} variants={{ normal: { rotate: 0 }, animate: { rotate: [0, -5, 5, 0] } }} transition={{ duration: 0.5 }}>
            <path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" />
          </motion.g>
          <motion.g animate={controls} variants={{ normal: { y: 0 }, animate: { y: [0, -2, 0] } }} transition={{ duration: 0.4, delay: 0.1 }}>
            <path d="m22 22-5-10-5 10" /><path d="M14 18h6" />
          </motion.g>
        </svg>
      </div>
    );
  }
);
LanguagesAnimated.displayName = "LanguagesAnimated";

/* ─── Step Forward (Continue writing) ─── */
export const StepForwardAnimated = forwardRef<HTMLDivElement, AnimatedIconProps>(
  ({ className, size = 16, ...props }, ref) => {
    const { controls, onMouseEnter, onMouseLeave } = useAnimatedIcon();
    return (
      <div ref={ref} className={className} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} {...props}>
        <svg fill="none" height={size} width={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <motion.g animate={controls} variants={{ normal: { x: 0 }, animate: { x: [0, 3, 0] } }} transition={{ type: "spring", stiffness: 300, damping: 15 }}>
            <path d="m6 4 10 8-10 8V4z" />
          </motion.g>
          <line x1="18" x2="18" y1="4" y2="20" />
        </svg>
      </div>
    );
  }
);
StepForwardAnimated.displayName = "StepForwardAnimated";

/* ─── Check (Replace selection) ─── */
export const CheckAnimated = forwardRef<HTMLDivElement, AnimatedIconProps>(
  ({ className, size = 16, ...props }, ref) => {
    const { controls, onMouseEnter, onMouseLeave } = useAnimatedIcon();
    return (
      <div ref={ref} className={className} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} {...props}>
        <svg fill="none" height={size} width={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <motion.path d="M20 6 9 17l-5-5" animate={controls} variants={{ normal: { pathLength: 1, opacity: 1 }, animate: { pathLength: [0, 1], opacity: [0, 1] } }} transition={{ duration: 0.4 }} />
        </svg>
      </div>
    );
  }
);
CheckAnimated.displayName = "CheckAnimated";

/* ─── Text Quote (Insert below) ─── */
export const TextQuoteAnimated = forwardRef<HTMLDivElement, AnimatedIconProps>(
  ({ className, size = 16, ...props }, ref) => {
    const { controls, onMouseEnter, onMouseLeave } = useAnimatedIcon();
    return (
      <div ref={ref} className={className} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} {...props}>
        <svg fill="none" height={size} width={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <motion.g animate={controls} variants={{ normal: { x: 0 }, animate: { x: [0, 2, 0] } }} transition={{ duration: 0.4 }}>
            <path d="M17 6H3" /><path d="M21 12H8" /><path d="M21 18H8" />
          </motion.g>
          <motion.path d="M3 12v6" animate={controls} variants={{ normal: { scaleY: 1 }, animate: { scaleY: [0, 1] } }} transition={{ duration: 0.3 }} />
        </svg>
      </div>
    );
  }
);
TextQuoteAnimated.displayName = "TextQuoteAnimated";

/* ─── Trash 2 (Discard) ─── */
export const Trash2Animated = forwardRef<HTMLDivElement, AnimatedIconProps>(
  ({ className, size = 16, ...props }, ref) => {
    const { controls, onMouseEnter, onMouseLeave } = useAnimatedIcon();
    return (
      <div ref={ref} className={className} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} {...props}>
        <svg fill="none" height={size} width={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <motion.g animate={controls} variants={{ normal: { y: 0 }, animate: { y: [-2, 0] } }} transition={{ type: "spring", stiffness: 300, damping: 15 }}>
            <path d="M3 6h18" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </motion.g>
          <motion.g animate={controls} variants={{ normal: { y: 0, opacity: 1 }, animate: { y: [0, 2, 0], opacity: [1, 0.5, 1] } }} transition={{ duration: 0.4 }}>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" />
          </motion.g>
        </svg>
      </div>
    );
  }
);
Trash2Animated.displayName = "Trash2Animated";

/* ─── Arrow Up (Send) ─── */
export const ArrowUpAnimated = forwardRef<HTMLDivElement, AnimatedIconProps>(
  ({ className, size = 14, ...props }, ref) => {
    const { controls, onMouseEnter, onMouseLeave } = useAnimatedIcon();
    return (
      <div ref={ref} className={className} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} {...props}>
        <svg fill="none" height={size} width={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
          <motion.g animate={controls} variants={{ normal: { y: 0 }, animate: { y: [-3, 0] } }} transition={{ type: "spring", stiffness: 400, damping: 15 }}>
            <path d="m5 12 7-7 7 7" /><path d="M12 19V5" />
          </motion.g>
        </svg>
      </div>
    );
  }
);
ArrowUpAnimated.displayName = "ArrowUpAnimated";
