import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import { SparklesIcon } from "@/components/icons/sparkles";
import { DeleteIcon } from "@/components/icons/delete";
import { ClockIcon } from "lucide-react";

interface RecordingLimitSheetProps {
  visible: boolean;
  timeLeft: number;
  onDismiss: () => void;
  onUpgrade: () => void;
}

export function RecordingLimitSheet({
  visible,
  timeLeft,
  onDismiss,
  onUpgrade,
}: RecordingLimitSheetProps) {
  const [dotLottie, setDotLottie] = useState<DotLottie | null>(null);

  useEffect(() => {
    if (!dotLottie) return;

    const fireAlert = () => {
      try {
        if (typeof dotLottie.stateMachineFireEvent === "function") {
          dotLottie.stateMachineFireEvent("alertClick");
        }
      } catch (err) {}
    };

    const fireNoClick = () => {
      try {
        if (typeof dotLottie.stateMachineFireEvent === "function") {
          dotLottie.stateMachineFireEvent("noClick");
        }
      } catch (err) {}
    };

    let interval: NodeJS.Timeout;
    const initialTimeout = setTimeout(() => {
      fireAlert();
      interval = setInterval(fireNoClick, 3000);
    }, 200);

    return () => {
      clearTimeout(initialTimeout);
      if (interval) clearInterval(interval);
    };
  }, [dotLottie]);

  const isExpired = timeLeft <= 0;
  
  // Format MM:SS
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            key="recording-limit-overlay"
            className="history-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={isExpired ? onDismiss : undefined}
          />

          <motion.div
            key="recording-limit-sheet"
            className="clipper-sheet account-sheet mx-auto"
            style={{ maxWidth: 600 }}
            initial={{ bottom: "-100%" }}
            animate={{ bottom: 0 }}
            exit={{ bottom: "-100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 350, mass: 0.8 }}
          >
            {/* Drag Handle */}
            <div className="history-sheet-handle" onClick={isExpired ? onDismiss : undefined}>
              <div className="history-sheet-handle-bar" />
            </div>

            <div className="relative pt-4 px-4 pb-4">
              <div className="absolute left-1/2 -top-[68px] -translate-x-1/2 z-10">
                <div className="w-[84px] h-[84px] flex items-center justify-center relative" style={{ clipPath: "inset(-100% -100% 0 -100%)" }}>
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

              <div className="text-center pt-4 pb-3">
                <h3 className="text-lg font-bold text-destructive mb-1 tracking-tight">
                  {isExpired ? "Recording Limit Reached" : "Approaching Limit"}
                </h3>
                
                {/* Large Countdown */}
                {!isExpired && (
                  <div className="flex items-center justify-center gap-2 my-3">
                    <ClockIcon className="w-5 h-5 text-destructive animate-pulse" />
                    <span className="text-4xl font-mono font-bold text-destructive tracking-tighter">
                      {formatTime(timeLeft)}
                    </span>
                  </div>
                )}
                
                <p className="text-xs text-muted-foreground mt-2">
                  {isExpired 
                    ? "Free users are limited to 20 minutes per recording. The recording has been stopped automatically."
                    : "Free users are limited to 20 minutes. Please conclude your recording soon or upgrade."}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="ai-cmd-groups" style={{ marginTop: "16px" }}>
                <div className="ai-cmd-group">
                  <button
                    className="novel-slash-item w-full text-left"
                    onClick={onUpgrade}
                  >
                    <div className="novel-slash-icon">
                      <AnimatedIcon animation="hover">
                        <SparklesIcon className="h-4 w-4" />
                      </AnimatedIcon>
                    </div>
                    <div>
                      <p className="text-[13px] font-medium">Upgrade to Pro</p>
                      <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                        Unlock unlimited recording time
                      </p>
                    </div>
                  </button>
                  
                  {isExpired && (
                    <button
                      className="novel-slash-item w-full text-left"
                      onClick={onDismiss}
                    >
                      <div className="novel-slash-icon" style={{ borderColor: "hsl(var(--destructive)/0.3)", color: "hsl(var(--destructive))" }}>
                        <AnimatedIcon animation="hover">
                          <DeleteIcon className="h-4 w-4" />
                        </AnimatedIcon>
                      </div>
                      <div>
                        <p className="text-[13px] font-medium text-destructive">Close & Save</p>
                        <p className="text-[11px]" style={{ color: "hsl(var(--destructive)/0.8)" }}>
                          Dismiss and save your recording
                        </p>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
