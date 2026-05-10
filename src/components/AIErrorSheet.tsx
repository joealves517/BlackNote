import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";
import { BadgeAlertIcon } from "@/components/ui/badge-alert";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import { SparklesIcon } from "@/components/icons/sparkles";
import { RefreshCCWDotIcon } from "@/components/icons/refresh-ccw-dot";
import { DeleteIcon } from "@/components/icons/delete";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l3.68-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.68 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

interface AIErrorSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onRetry?: () => void;
  user: any;
  isPremium: boolean;
  isQuotaExhausted: boolean;
  onLogin: () => void;
  onUpgrade: () => void;
}

export function AIErrorSheet({
  visible,
  onDismiss,
  onRetry,
  user,
  isPremium,
  isQuotaExhausted,
  onLogin,
  onUpgrade,
}: AIErrorSheetProps) {
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

  // Logic branches for content based on user state
  const isProWithQuota = isPremium && !isQuotaExhausted;
  
  const message = !user
    ? "Sign in to unlock free AI features."
    : isProWithQuota
    ? "We are currently experiencing issues. Please try again."
    : isPremium && isQuotaExhausted
    ? "Server is experiencing high traffic."
    : "Server is experiencing high traffic. Upgrade to Pro for unlimited AI.";

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            key="ai-error-overlay"
            className="history-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onDismiss}
          />

          <motion.div
            key="ai-error-sheet"
            className="clipper-sheet account-sheet mx-auto"
            style={{ maxWidth: 600 }}
            initial={{ bottom: "-100%" }}
            animate={{ bottom: 0 }}
            exit={{ bottom: "-100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 350, mass: 0.8 }}
          >
            {/* Drag Handle */}
            <div className="history-sheet-handle" onClick={onDismiss}>
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
                <h3 className="text-lg font-bold text-destructive mb-1 tracking-tight">AI Error</h3>
                <p className="text-xs text-muted-foreground">{message}</p>
              </div>

              {/* Action Buttons */}
              <div className="ai-cmd-groups" style={{ marginTop: "16px" }}>
                <div className="ai-cmd-group">
                  {!user && (
                    <button
                      className="novel-slash-item w-full text-left"
                      onClick={onLogin}
                    >
                      <div className="novel-slash-icon bg-white border-transparent">
                        <AnimatedIcon animation="hover">
                          <GoogleIcon />
                        </AnimatedIcon>
                      </div>
                      <div>
                        <p className="text-[13px] font-medium">Sign in with Google</p>
                        <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                          Unlock free AI capabilities
                        </p>
                      </div>
                    </button>
                  )}

                  {user && !isProWithQuota && (
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
                          Unlock full AI capabilities
                        </p>
                      </div>
                    </button>
                  )}
                  
                  {user && onRetry && (
                    <button
                      className="novel-slash-item w-full text-left"
                      onClick={onRetry}
                    >
                      <div className="novel-slash-icon">
                        <AnimatedIcon animation="hover">
                          <RefreshCCWDotIcon className="h-4 w-4" />
                        </AnimatedIcon>
                      </div>
                      <div>
                        <p className="text-[13px] font-medium">Retry</p>
                        <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                          Attempt to connect again
                        </p>
                      </div>
                    </button>
                  )}
                  
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
                      <p className="text-[13px] font-medium text-destructive">Close</p>
                      <p className="text-[11px]" style={{ color: "hsl(var(--destructive)/0.8)" }}>
                        Dismiss this notification
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
