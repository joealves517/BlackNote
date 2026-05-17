import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";

interface AIProcessingViewProps {
  title: string;
  messages: string[];
}

export function AIProcessingView({ title, messages }: AIProcessingViewProps) {
  const [statusMsg, setStatusMsg] = useState(messages[0]);
  const [dotLottie, setDotLottie] = useState<DotLottie | null>(null);

  // Robot Lottie state machine (Processing mode)
  useEffect(() => {
    if (!dotLottie) return;
    const fire = (evt: string) => {
      try {
        dotLottie.stateMachineFireEvent?.(evt);
      } catch {}
    };

    // Initial jump entrance, then transition to thinking loop
    let interval: NodeJS.Timeout;
    const t = setTimeout(() => {
      fire("jumpClick");
      interval = setInterval(() => {
        fire("thinkClick");
      }, 1500);
    }, 200);

    return () => {
      clearTimeout(t);
      if (interval) clearInterval(interval);
    };
  }, [dotLottie]);

  // Fake processing messages rotation
  useEffect(() => {
    setStatusMsg(messages[0]);
    let idx = 0;
    const timer = setInterval(() => {
      idx = Math.min(idx + 1, messages.length - 1);
      setStatusMsg(messages[idx]);
    }, 2200);
    return () => clearInterval(timer);
  }, [messages]);

  return (
    <motion.div
      className="pt-4 px-4 pb-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "100%",
        paddingBottom: 8
      }}
    >
      {/* ─── Floating Robot ─── */}
      <div className="floating-robot-wrapper">
        <div
          className="w-[84px] h-[84px] flex items-center justify-center relative"
          style={{ clipPath: "inset(-100% -100% 0 -100%)" }}
        >
          <DotLottieReact
            src={chrome.runtime.getURL("ai-robo.lottie")}
            autoplay
            loop
            stateMachineId="StateMachine1"
            dotLottieRefCallback={setDotLottie}
            backgroundColor="transparent"
            style={{
              width: "150%",
              height: "150%",
              transform: "scale(1.35) translateY(2%)",
              position: "absolute",
            }}
          />
        </div>
      </div>

      {/* ─── Header ─── */}
      <div className="text-center pt-4 pb-1">
        <h3 className="text-lg font-bold text-foreground mb-1 tracking-tight">
          {title}
        </h3>
        <p className="text-xs text-muted-foreground">
          {statusMsg}...
        </p>
      </div>

      {/* ─── Vector Loading Bar ─── */}
      <div className="simple-loader-container">
        <DotLottieReact
          src={chrome.runtime.getURL("simple-loading-bar.json")}
          autoplay
          loop
          backgroundColor="transparent"
        />
      </div>
    </motion.div>
  );
}
