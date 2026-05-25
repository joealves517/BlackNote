import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ShinyText from "./ShinyText";

interface DynamicThinkingProps {
  messages: string[];
  interval?: number;
}

export function DynamicThinking({ messages, interval = 1200 }: DynamicThinkingProps) {
  const [index, setIndex] = useState(0);
  const [dotCount, setDotCount] = useState(1);

  // Cycle text
  useEffect(() => {
    if (messages.length <= 1) return;
    const textTimer = setInterval(() => {
      setIndex((prev) => {
        if (prev >= messages.length - 1) {
          clearInterval(textTimer);
          return prev;
        }
        return prev + 1;
      });
    }, interval);
    return () => clearInterval(textTimer);
  }, [messages.length, interval]);

  // Cycle dots
  useEffect(() => {
    const dotTimer = setInterval(() => {
      setDotCount((prev) => (prev % 3) + 1);
    }, 400);
    return () => clearInterval(dotTimer);
  }, []);

  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <AnimatePresence mode="wait">
        <motion.span
          key={index}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          transition={{ duration: 0.15 }}
          style={{ whiteSpace: "nowrap" }}
        >
          <ShinyText 
            text={messages[index]} 
            speed={2} 
            color="hsl(var(--muted-foreground) / 0.85)" 
            shineColor="hsl(var(--foreground))"
          />
        </motion.span>
      </AnimatePresence>
      <span style={{ width: "12px", display: "inline-block", textAlign: "left", color: "hsl(var(--muted-foreground) / 0.85)" }}>
        {".".repeat(dotCount)}
      </span>
    </span>
  );
}

