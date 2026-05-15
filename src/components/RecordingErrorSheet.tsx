import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import { RefreshCCWDotIcon } from "@/components/icons/refresh-ccw-dot";
import { DeleteIcon } from "@/components/icons/delete";
import { SparklesIcon } from "@/components/icons/sparkles";
import { Mic, MonitorUp, Settings, Play } from "lucide-react";

// ─── Error Classification ─────────────────────────────────────────

export type RecordingErrorCode =
  | "NO_DEVICE"
  | "NOT_ALLOWED"
  | "DEVICE_IN_USE"
  | "NO_AUDIO_SOURCES"
  | "STT_NO_MIC"
  | "UNKNOWN";

export interface RecordingErrorInfo {
  code: RecordingErrorCode;
  title: string;
  message: string;
}

export function classifyRecordingError(err: any): RecordingErrorInfo {
  const name = err?.name || "";
  const msg = (err?.message || String(err)).toLowerCase();

  if (name === "NotFoundError" || msg.includes("requested device not found") || msg.includes("no device")) {
    return {
      code: "NO_DEVICE",
      title: "No Microphone Found",
      message: "No microphone was detected on this device. You can still record system/tab audio without a microphone.",
    };
  }

  if (name === "NotAllowedError" || msg.includes("notallowederror") || msg.includes("permission denied")) {
    return {
      code: "NOT_ALLOWED",
      title: "Permission Required",
      message: "BlackNote needs microphone access to record. Please grant permission and try again.",
    };
  }

  if (name === "NotReadableError" || msg.includes("could not start") || msg.includes("in use")) {
    return {
      code: "DEVICE_IN_USE",
      title: "Microphone Busy",
      message: "Your microphone is being used by another app. Close other apps using the mic and try again.",
    };
  }

  if (msg.includes("no audio sources")) {
    return {
      code: "NO_AUDIO_SOURCES",
      title: "No Audio Available",
      message: "No audio sources could be found. Please connect a microphone or select a tab/screen to capture audio from.",
    };
  }

  return {
    code: "UNKNOWN",
    title: "Recording Failed",
    message: err?.message || "An unexpected error occurred. Please try again.",
  };
}

// ─── Component ─────────────────────────────────────────────────────

interface RecordingErrorSheetProps {
  visible: boolean;
  errorInfo: RecordingErrorInfo | null;
  onDismiss: () => void;
  onRetry?: () => void;
  onContinueWithoutMic?: () => void;
  onOpenSettings?: () => void;
}

export function RecordingErrorSheet({
  visible,
  errorInfo,
  onDismiss,
  onRetry,
  onContinueWithoutMic,
  onOpenSettings,
}: RecordingErrorSheetProps) {
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

  if (!errorInfo) return null;

  const showContinueWithoutMic = errorInfo.code === "NO_DEVICE" && onContinueWithoutMic;
  const showGrantPermission = errorInfo.code === "NOT_ALLOWED" && onOpenSettings;

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            key="rec-error-overlay"
            className="history-sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onDismiss}
          />

          <motion.div
            key="rec-error-sheet"
            className="clipper-sheet account-sheet mx-auto"
            style={{ maxWidth: 400 }}
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
                <h3 className="text-lg font-bold text-destructive mb-1 tracking-tight">{errorInfo.title}</h3>
                <p className="text-xs text-muted-foreground">{errorInfo.message}</p>
              </div>

              {/* Action Buttons */}
              <div className="ai-cmd-groups" style={{ marginTop: "16px" }}>
                <div className="ai-cmd-group">
                  {showContinueWithoutMic && (
                    <button
                      className="novel-slash-item w-full text-left"
                      onClick={onContinueWithoutMic}
                    >
                      <div className="novel-slash-icon" style={{
                        background: "linear-gradient(135deg, rgba(16, 185, 129, var(--icon-bg-start)) 0%, rgba(16, 185, 129, var(--icon-bg-end)) 100%)",
                        border: "1px solid rgba(16, 185, 129, var(--icon-border))",
                        color: "rgba(16, 185, 129, 1)",
                      }}>
                        <AnimatedIcon animation="hover">
                          <Play className="h-4 w-4" />
                        </AnimatedIcon>
                      </div>
                      <div>
                        <p className="text-[13px] font-medium">Continue without Mic</p>
                        <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                          Record system/tab audio only
                        </p>
                      </div>
                    </button>
                  )}

                  {showGrantPermission && (
                    <button
                      className="novel-slash-item w-full text-left"
                      onClick={onOpenSettings}
                    >
                      <div className="novel-slash-icon" style={{
                        background: "linear-gradient(135deg, rgba(59, 130, 246, var(--icon-bg-start)) 0%, rgba(59, 130, 246, var(--icon-bg-end)) 100%)",
                        border: "1px solid rgba(59, 130, 246, var(--icon-border))",
                        color: "rgba(59, 130, 246, 1)",
                      }}>
                        <AnimatedIcon animation="hover">
                          <Settings className="h-4 w-4" />
                        </AnimatedIcon>
                      </div>
                      <div>
                        <p className="text-[13px] font-medium">Grant Permission</p>
                        <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                          Open microphone permission settings
                        </p>
                      </div>
                    </button>
                  )}

                  {onRetry && (
                    <button
                      className="novel-slash-item w-full text-left"
                      onClick={onRetry}
                    >
                      <div className="novel-slash-icon" style={{
                        background: "linear-gradient(135deg, rgba(245, 158, 11, var(--icon-bg-start)) 0%, rgba(245, 158, 11, var(--icon-bg-end)) 100%)",
                        border: "1px solid rgba(245, 158, 11, var(--icon-border))",
                        color: "rgba(245, 158, 11, 1)",
                      }}>
                        <AnimatedIcon animation="hover">
                          <RefreshCCWDotIcon className="h-4 w-4" />
                        </AnimatedIcon>
                      </div>
                      <div>
                        <p className="text-[13px] font-medium">Try Again</p>
                        <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                          Retry the recording
                        </p>
                      </div>
                    </button>
                  )}

                  <button
                    className="novel-slash-item w-full text-left"
                    onClick={onDismiss}
                  >
                    <div className="novel-slash-icon" style={{
                      background: "linear-gradient(135deg, rgba(239, 68, 68, var(--icon-bg-start)) 0%, rgba(239, 68, 68, var(--icon-bg-end)) 100%)",
                      border: "1px solid rgba(239, 68, 68, var(--icon-border))",
                      color: "rgba(239, 68, 68, 1)",
                    }}>
                      <AnimatedIcon animation="hover">
                        <DeleteIcon className="h-4 w-4" />
                      </AnimatedIcon>
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-destructive">Cancel</p>
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
