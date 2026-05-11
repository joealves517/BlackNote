import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import { LogoutIcon } from "@/components/icons/logout";
import { DeleteIcon } from "@/components/icons/delete";

interface SignOutConfirmSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
}

export function SignOutConfirmSheet({
  visible,
  onDismiss,
  onConfirm,
}: SignOutConfirmSheetProps) {
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

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            key="signout-overlay"
            className="history-sheet-backdrop z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onDismiss}
          />

          <motion.div
            key="signout-sheet"
            className="clipper-sheet account-sheet mx-auto z-[61]"
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
                <h3 className="text-lg font-bold text-foreground mb-1 tracking-tight">Sign Out</h3>
                <p className="text-xs text-muted-foreground leading-relaxed px-2">
                  Your notes are safely synced to the cloud, but local media files will be permanently deleted.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="ai-cmd-groups" style={{ marginTop: "16px" }}>
                <div className="ai-cmd-group">
                  <button
                    className="novel-slash-item w-full text-left"
                    onClick={onConfirm}
                  >
                    <div className="novel-slash-icon" style={{ borderColor: "hsl(var(--destructive)/0.3)", color: "hsl(var(--destructive))" }}>
                      <AnimatedIcon animation="hover">
                        <LogoutIcon className="h-4 w-4" />
                      </AnimatedIcon>
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-destructive">Sign Out & Delete Local Media</p>
                      <p className="text-[11px]" style={{ color: "hsl(var(--destructive)/0.8)" }}>
                        Confirm and log out of your account
                      </p>
                    </div>
                  </button>

                  <button
                    className="novel-slash-item w-full text-left"
                    onClick={onDismiss}
                  >
                    <div className="novel-slash-icon" style={{ borderColor: "hsl(var(--muted-foreground)/0.3)", color: "hsl(var(--muted-foreground))" }}>
                      <AnimatedIcon animation="hover">
                        <DeleteIcon className="h-4 w-4" />
                      </AnimatedIcon>
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-foreground">Cancel</p>
                      <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                        Stay logged in
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
