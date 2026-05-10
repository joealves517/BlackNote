import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";

// Mock CSS Waveform
function MockWaveform() {
  return (
    <div className="ai-css-waveform">
      <div className="bar bar1"></div>
      <div className="bar bar2"></div>
      <div className="bar bar3"></div>
      <div className="bar bar4"></div>
      <div className="bar bar5"></div>
    </div>
  );
}

// Animated Dots that don't resize the container
function AnimatedDots() {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const dotTimer = setInterval(() => {
      setDotCount((prev) => (prev % 3) + 1);
    }, 400);
    return () => clearInterval(dotTimer);
  }, []);

  return (
    <span style={{ display: "inline-block", width: "20px", textAlign: "left" }}>
      {".".repeat(dotCount)}
    </span>
  );
}

interface AIDynamicIslandProps extends React.HTMLAttributes<HTMLDivElement> {
  messages?: string[];
}

export const AIDynamicIsland = React.forwardRef<HTMLDivElement, AIDynamicIslandProps>(
  ({ messages = ["Thinking"], ...props }, ref) => {
    const [dotLottie, setDotLottie] = useState<DotLottie | null>(null);

  useEffect(() => {
    if (!dotLottie) return;

    const fire = (evt: string) => {
      try {
        dotLottie.stateMachineFireEvent?.(evt);
      } catch {}
    };

    // Initial jump entrance, then transition to thinking loop
    let interval: NodeJS.Timeout;
    const initialTimeout = setTimeout(() => {
      fire("jumpClick");
      interval = setInterval(() => fire("thinkClick"), 1500);
    }, 200);

    return () => {
      clearTimeout(initialTimeout);
      if (interval) clearInterval(interval);
    };
  }, [dotLottie]);

  return (
    <motion.div
      ref={ref}
      className="recording-header-container"
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -80, opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 350 }}
      style={{ pointerEvents: "auto", position: "absolute", zIndex: 50, top: 0, left: 0, right: 0 }}
      {...props as any}
    >
      {/* Left Pill (Main Island) */}
      <div className="recording-island" style={{ padding: "4px 16px 4px 12px", justifyContent: "flex-start", gap: "8px", width: "140px", zIndex: 2 }}>
        <MockWaveform />
        <span className="ai-island-text text-[13px] font-medium ml-1 text-foreground tracking-tight whitespace-nowrap overflow-hidden">
          Processing<AnimatedDots />
        </span>
      </div>

      {/* Right Circle (Robot) */}
      <div style={{ width: 40, height: 40, position: "relative", flexShrink: 0, marginLeft: 4 }}>
        <div 
          className="w-[84px] h-[84px] flex items-center justify-center pointer-events-none" 
          style={{ 
            position: "absolute", 
            left: "50%", 
            top: "50%", 
            transform: "translate(-50%, -50%) scale(0.48)", 
            clipPath: "inset(-100% -100% 0 -100%)" 
          }}
        >
          <DotLottieReact
            src={chrome.runtime.getURL("ai-robo.lottie")}
            autoplay
            loop
            stateMachineId="StateMachine1"
            dotLottieRefCallback={setDotLottie}
            backgroundColor="transparent"
            style={{ width: "150%", height: "150%", transform: "scale(1.35) translateY(2%)", position: "absolute" }}
          />
        </div>
      </div>
    </motion.div>
  );
});

AIDynamicIsland.displayName = "AIDynamicIsland";
