import React from "react";
import { goeyToast } from "goey-toast";
import { SparklesIcon } from "@/components/icons/sparkles";
import { RefreshCCWDotIcon } from "@/components/icons/refresh-ccw-dot";
import { DeleteIcon } from "@/components/icons/delete";
import { LogoutIcon } from "@/components/icons/logout";
import { LoaderCircleIcon } from "@/components/icons/loader-circle";
import { Play, Settings, Clock } from "lucide-react";

// Google Icon Component for Google Sign In Button
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

// ─── AI ERROR TOAST ──────────────────────────────────────────────────

interface ShowAIErrorToastProps {
  user: any;
  isPremium: boolean;
  isQuotaExhausted: boolean;
  onLogin: () => void;
  onUpgrade: () => void;
  onRetry?: () => void;
}

export function showAIErrorToast({
  user,
  isPremium,
  isQuotaExhausted,
  onLogin,
  onUpgrade,
  onRetry,
}: ShowAIErrorToastProps) {
  const isProWithQuota = isPremium && !isQuotaExhausted;
  
  const message = !user
    ? "Sign in to unlock free AI features."
    : isProWithQuota
    ? "We are currently experiencing issues. Please try again."
    : isPremium && isQuotaExhausted
    ? "Server is experiencing high traffic."
    : "Server is experiencing high traffic. Upgrade to Pro for unlimited AI.";

  const toastId = goeyToast.error("AI Error", {
    duration: 15000,
    timing: {
      displayDuration: 15000,
    },
    showProgress: false,
    showTimestamp: false,
    classNames: {
      title: "text-sm font-bold leading-none tracking-tight",
    },
    description: (
      <div className="flex flex-col gap-2 mt-1 w-[260px]">
        <p className="text-[11px] opacity-90 leading-normal text-zinc-600 dark:text-white/90">{message}</p>
        
        <div className="flex flex-col gap-1.5 mt-1.5 w-full">
          {!user && (
            <button
              onClick={() => {
                onLogin();
                goeyToast.dismiss(toastId);
              }}
              className="flex items-center gap-2.5 w-full p-2 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-left transition-colors cursor-pointer border border-black/5 dark:border-white/5"
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-white shadow-sm flex-shrink-0">
                <GoogleIcon />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-zinc-800 dark:text-white leading-none">Sign in with Google</p>
                <p className="text-[9.5px] text-zinc-500 dark:text-white/70 truncate mt-0.5">Unlock free AI capabilities</p>
              </div>
            </button>
          )}

          {user && !isProWithQuota && (
            <button
              onClick={() => {
                onUpgrade();
                goeyToast.dismiss(toastId);
              }}
              className="flex items-center gap-2.5 w-full p-2 rounded-xl bg-purple-500/10 dark:bg-purple-500/20 hover:bg-purple-500/20 dark:hover:bg-purple-500/30 text-left transition-colors cursor-pointer border border-purple-500/10"
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-200 shadow-sm flex-shrink-0">
                <SparklesIcon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-purple-600 dark:text-purple-100 leading-none">Upgrade to Pro</p>
                <p className="text-[9.5px] text-purple-500 dark:text-purple-200/70 truncate mt-0.5">Unlock full AI capabilities</p>
              </div>
            </button>
          )}

          {user && onRetry && (
            <button
              onClick={() => {
                onRetry();
                goeyToast.dismiss(toastId);
              }}
              className="flex items-center gap-2.5 w-full p-2 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 hover:bg-amber-500/20 dark:hover:bg-amber-500/30 text-left transition-colors cursor-pointer border border-amber-500/10"
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-200 shadow-sm flex-shrink-0">
                <RefreshCCWDotIcon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-100 leading-none">Retry</p>
                <p className="text-[9.5px] text-amber-500 dark:text-amber-200/70 truncate mt-0.5">Attempt to connect again</p>
              </div>
            </button>
          )}

          <button
            onClick={() => goeyToast.dismiss(toastId)}
            className="flex items-center gap-2.5 w-full p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-left transition-colors cursor-pointer border border-black/5 dark:border-white/5"
          >
            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-black/10 dark:bg-white/10 text-zinc-700 dark:text-white shadow-sm flex-shrink-0">
              <DeleteIcon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-zinc-800 dark:text-white/90 leading-none">Close</p>
              <p className="text-[9.5px] text-zinc-500 dark:text-white/60 truncate mt-0.5">Dismiss this notification</p>
            </div>
          </button>
        </div>
      </div>
    )
  });

  return toastId;
}

// ─── RECORDING ERROR TOAST ───────────────────────────────────────────

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

interface ShowRecordingErrorToastProps {
  errorInfo: RecordingErrorInfo;
  onDismiss: () => void;
  onRetry?: () => void;
  onContinueWithoutMic?: () => void;
  onOpenSettings?: () => void;
}

export function showRecordingErrorToast({
  errorInfo,
  onDismiss,
  onRetry,
  onContinueWithoutMic,
  onOpenSettings,
}: ShowRecordingErrorToastProps) {
  const showContinueWithoutMic = errorInfo.code === "NO_DEVICE" && onContinueWithoutMic;
  const showGrantPermission = errorInfo.code === "NOT_ALLOWED" && onOpenSettings;

  const toastId = goeyToast.error(errorInfo.title, {
    duration: 15000,
    timing: {
      displayDuration: 15000,
    },
    showProgress: false,
    showTimestamp: false,
    classNames: {
      title: "text-sm font-bold leading-none tracking-tight",
    },
    description: (
      <div className="flex flex-col gap-2 mt-1 w-[260px]">
        <p className="text-[11px] opacity-90 leading-normal text-zinc-600 dark:text-white/90">{errorInfo.message}</p>
        
        <div className="flex flex-col gap-1.5 mt-1.5 w-full">
          {showContinueWithoutMic && (
            <button
              onClick={() => {
                onContinueWithoutMic();
                goeyToast.dismiss(toastId);
              }}
              className="flex items-center gap-2.5 w-full p-2 rounded-xl bg-emerald-500/8 dark:bg-emerald-500/15 hover:bg-emerald-500/15 dark:hover:bg-emerald-500/25 text-left transition-colors cursor-pointer border border-emerald-500/15 dark:border-emerald-500/10"
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 shadow-sm flex-shrink-0">
                <Play className="h-3 w-3 fill-current" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-200 leading-none">Continue without Mic</p>
                <p className="text-[9.5px] text-emerald-600/90 dark:text-emerald-300/80 truncate mt-0.5">Record system/tab audio only</p>
              </div>
            </button>
          )}

          {showGrantPermission && (
            <button
              onClick={() => {
                if (onOpenSettings) onOpenSettings();
                goeyToast.dismiss(toastId);
              }}
              className="flex items-center gap-2.5 w-full p-2 rounded-xl bg-blue-500/8 dark:bg-blue-500/15 hover:bg-blue-500/15 dark:hover:bg-blue-500/25 text-left transition-colors cursor-pointer border border-blue-500/15 dark:border-blue-500/10"
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 shadow-sm flex-shrink-0">
                <Settings className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-200 leading-none">Grant Permission</p>
                <p className="text-[9.5px] text-blue-600/90 dark:text-blue-300/80 truncate mt-0.5">Open microphone settings</p>
              </div>
            </button>
          )}

          {onRetry && (
            <button
              onClick={() => {
                onRetry();
                goeyToast.dismiss(toastId);
              }}
              className="flex items-center gap-2.5 w-full p-2 rounded-xl bg-amber-500/8 dark:bg-amber-500/15 hover:bg-amber-500/15 dark:hover:bg-amber-500/25 text-left transition-colors cursor-pointer border border-amber-500/15 dark:border-amber-500/10"
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 shadow-sm flex-shrink-0">
                <RefreshCCWDotIcon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-200 leading-none">Try Again</p>
                <p className="text-[9.5px] text-amber-600/90 dark:text-amber-300/80 truncate mt-0.5">Retry the recording</p>
              </div>
            </button>
          )}

          <button
            onClick={() => {
              onDismiss();
              goeyToast.dismiss(toastId);
            }}
            className="flex items-center gap-2.5 w-full p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/80 text-left transition-colors cursor-pointer border border-zinc-200/60 dark:border-zinc-700/40"
          >
            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 shadow-sm flex-shrink-0">
              <DeleteIcon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 leading-none">Cancel</p>
              <p className="text-[9.5px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">Dismiss this notification</p>
            </div>
          </button>
        </div>
      </div>
    )
  });

  return toastId;
}

// ─── RECORDING LIMIT TOAST ───────────────────────────────────────────

interface ShowRecordingLimitToastProps {
  timeLeft: number;
  onUpgrade: () => void;
  onDismiss: () => void;
}

// Format MM:SS
const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

export function showRecordingLimitToast({
  timeLeft,
  onUpgrade,
  onDismiss,
}: ShowRecordingLimitToastProps) {
  const isExpired = timeLeft <= 0;
  const title = isExpired ? "Recording Limit Reached" : "Approaching Limit";
  const message = isExpired
    ? "Free users are limited to 20 minutes per recording. The recording has been stopped automatically."
    : "Free users are limited to 20 minutes. Please conclude your recording soon or upgrade.";

  const toastId = goeyToast.warning(title, {
    id: "recording-limit-toast", // Set a constant ID so we can update it seamlessly
    duration: 15000,
    timing: {
      displayDuration: 15000,
    },
    showProgress: false,
    showTimestamp: false,
    classNames: {
      title: "text-sm font-bold leading-none tracking-tight",
    },
    description: (
      <div className="flex flex-col gap-2 mt-1 w-[260px]">
        {!isExpired && (
          <div className="flex items-center gap-2 bg-amber-500/8 dark:bg-amber-500/15 p-2 rounded-xl justify-center border border-amber-500/15 dark:border-amber-500/10">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-pulse" />
            <span className="text-xl font-mono font-bold text-amber-700 dark:text-amber-300 tracking-tight">
              {formatTime(timeLeft)}
            </span>
          </div>
        )}
        
        <p className="text-[11px] opacity-90 leading-normal text-zinc-600 dark:text-white/90">{message}</p>
        
        <div className="flex flex-col gap-1.5 mt-1.5 w-full">
          <button
            onClick={() => {
              onUpgrade();
              goeyToast.dismiss("recording-limit-toast");
            }}
            className="flex items-center gap-2.5 w-full p-2 rounded-xl bg-purple-500/8 dark:bg-purple-500/15 hover:bg-purple-500/15 dark:hover:bg-purple-500/25 text-left transition-colors cursor-pointer border border-purple-500/15 dark:border-purple-500/10"
          >
            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300 shadow-sm flex-shrink-0">
              <SparklesIcon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-purple-700 dark:text-purple-200 leading-none">Upgrade to Pro</p>
              <p className="text-[9.5px] text-purple-600/90 dark:text-purple-300/80 truncate mt-0.5">Unlock unlimited recording time</p>
            </div>
          </button>
 
          {isExpired && (
            <button
              onClick={() => {
                onDismiss();
                goeyToast.dismiss("recording-limit-toast");
              }}
              className="flex items-center gap-2.5 w-full p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/80 text-left transition-colors cursor-pointer border border-zinc-200/60 dark:border-zinc-700/40"
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 shadow-sm flex-shrink-0">
                <DeleteIcon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 leading-none">Close & Save</p>
                <p className="text-[9.5px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">Dismiss and save your recording</p>
              </div>
            </button>
          )}
        </div>
      </div>
    )
  });

  return toastId;
}

// ─── RECORDING LIMIT UPDATE HELPER ────────────────────────────────────

export function updateRecordingLimitToast(timeLeft: number, onUpgrade: () => void, onDismiss: () => void) {
  const isExpired = timeLeft <= 0;
  const title = isExpired ? "Recording Limit Reached" : "Approaching Limit";
  const message = isExpired
    ? "Free users are limited to 20 minutes per recording. The recording has been stopped automatically."
    : "Free users are limited to 20 minutes. Please conclude your recording soon or upgrade.";

  goeyToast.update("recording-limit-toast", {
    title,
    type: isExpired ? "error" : "warning",
    showTimestamp: false,
    description: (
      <div className="flex flex-col gap-2 mt-1 w-[260px]">
        {!isExpired && (
          <div className="flex items-center gap-2 bg-amber-500/8 dark:bg-amber-500/15 p-2 rounded-xl justify-center border border-amber-500/15 dark:border-amber-500/10">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-pulse" />
            <span className="text-xl font-mono font-bold text-amber-700 dark:text-amber-300 tracking-tight">
              {formatTime(timeLeft)}
            </span>
          </div>
        )}
        
        <p className="text-[11px] opacity-90 leading-normal text-zinc-600 dark:text-white/90">{message}</p>
        
        <div className="flex flex-col gap-1.5 mt-1.5 w-full">
          <button
            onClick={() => {
              onUpgrade();
              goeyToast.dismiss("recording-limit-toast");
            }}
            className="flex items-center gap-2.5 w-full p-2 rounded-xl bg-purple-500/8 dark:bg-purple-500/15 hover:bg-purple-500/15 dark:hover:bg-purple-500/25 text-left transition-colors cursor-pointer border border-purple-500/15 dark:border-purple-500/10"
          >
            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300 shadow-sm flex-shrink-0">
              <SparklesIcon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-purple-700 dark:text-purple-200 leading-none">Upgrade to Pro</p>
              <p className="text-[9.5px] text-purple-600/90 dark:text-purple-300/80 truncate mt-0.5">Unlock unlimited recording time</p>
            </div>
          </button>
 
          {isExpired && (
            <button
              onClick={() => {
                onDismiss();
                goeyToast.dismiss("recording-limit-toast");
              }}
              className="flex items-center gap-2.5 w-full p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/80 text-left transition-colors cursor-pointer border border-zinc-200/60 dark:border-zinc-700/40"
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 shadow-sm flex-shrink-0">
                <DeleteIcon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 leading-none">Close & Save</p>
                <p className="text-[9.5px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">Dismiss and save your recording</p>
              </div>
            </button>
          )}
        </div>
      </div>
    )
  });
}

// ─── SUPPORT TOASTS ──────────────────────────────────────────────────

export function showSupportSuccessToast() {
  const toastId = goeyToast.success("Message Sent!", {
    duration: 4000,
    showProgress: false,
    timing: {
      displayDuration: 4000,
    },
    showTimestamp: false,
    classNames: {
      title: "text-sm font-bold leading-none tracking-tight",
    },
    description: (
      <div className="flex flex-col gap-1 mt-1 w-[260px]">
        <p className="text-[11px] opacity-90 leading-normal">
          Thank you for your feedback. We'll get back to you soon.
        </p>
      </div>
    )
  });
  return toastId;
}

export function showSupportErrorToast(errorMessage?: string, onRetry?: () => void) {
  const toastId = goeyToast.error("Failed to Send", {
    duration: 15000,
    timing: {
      displayDuration: 15000,
    },
    showTimestamp: false,
    classNames: {
      title: "text-sm font-bold leading-none tracking-tight",
    },
    description: (
      <div className="flex flex-col gap-2 mt-1 w-[260px]">
        <p className="text-[11px] opacity-90 leading-normal text-zinc-600 dark:text-white/90">
          {errorMessage || "We encountered an issue while sending your message. Please try again."}
        </p>
        
        <div className="flex flex-col gap-1.5 mt-1.5 w-full">
          {onRetry && (
            <button
              onClick={() => {
                onRetry();
                goeyToast.dismiss(toastId);
              }}
              className="flex items-center gap-2.5 w-full p-2 rounded-xl bg-amber-500/8 dark:bg-amber-500/15 hover:bg-amber-500/15 dark:hover:bg-amber-500/25 text-left transition-colors cursor-pointer border border-amber-500/15 dark:border-amber-500/10"
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 shadow-sm flex-shrink-0">
                <RefreshCCWDotIcon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-200 leading-none">Try Again</p>
                <p className="text-[9.5px] text-amber-600/90 dark:text-amber-300/80 truncate mt-0.5">Attempt to send the message again</p>
              </div>
            </button>
          )}

          <button
            onClick={() => goeyToast.dismiss(toastId)}
            className="flex items-center gap-2.5 w-full p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/80 text-left transition-colors cursor-pointer border border-zinc-200/60 dark:border-zinc-700/40"
          >
            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 shadow-sm flex-shrink-0">
              <DeleteIcon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 leading-none">Close</p>
              <p className="text-[9.5px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">Dismiss this notification</p>
            </div>
          </button>
        </div>
      </div>
    )
  });
  return toastId;
}

// ─── AUTH & SYNC TOASTS ──────────────────────────────────────────────

export function showSignInSuccessToast(userName: string) {
  return goeyToast.success("Welcome back!", {
    duration: 3000,
    showProgress: false,
    showTimestamp: false,
    classNames: {
      title: "text-sm font-bold leading-none tracking-tight",
    },
    description: (
      <div className="flex flex-col gap-1 mt-1 w-[260px]">
        <p className="text-[11px] opacity-90 leading-normal">
          Signed in successfully as <span className="font-semibold text-white">{userName}</span>.
        </p>
      </div>
    ),
  });
}

export function showSignOutSuccessToast() {
  return goeyToast.success("Signed Out", {
    duration: 3000,
    showProgress: false,
    showTimestamp: false,
    classNames: {
      title: "text-sm font-bold leading-none tracking-tight",
    },
    description: (
      <div className="flex flex-col gap-1 mt-1 w-[260px]">
        <p className="text-[11px] opacity-90 leading-normal">
          You have been signed out successfully.
        </p>
      </div>
    ),
  });
}

export function showSyncingToast() {
  return goeyToast("Syncing Notes", {
    id: "sync-toast",
    duration: 10000, // Will be updated or dismissed manually
    showProgress: false,
    showTimestamp: false,
    icon: <LoaderCircleIcon className="h-4 w-4 animate-spin text-white/80" />,
    classNames: {
      title: "text-sm font-bold leading-none tracking-tight",
    },
    description: (
      <div className="flex flex-col gap-1 mt-1 w-[260px]">
        <p className="text-[11px] opacity-90 leading-normal">
          Synchronizing your notes with the cloud...
        </p>
      </div>
    ),
  });
}

export function showSyncSuccessToast(count: number) {
  const message = count > 0 
    ? `Successfully synchronized ${count} ${count === 1 ? 'note' : 'notes'} with the cloud.`
    : "Your notes are completely up to date.";

  goeyToast.update("sync-toast", {
    title: "Notes Synced",
    type: "success",
    icon: null,
    showTimestamp: false,
    description: (
      <div className="flex flex-col gap-1 mt-1 w-[260px]">
        <p className="text-[11px] opacity-90 leading-normal">{message}</p>
      </div>
    ),
  });

  setTimeout(() => {
    goeyToast.dismiss("sync-toast");
  }, 3000);

  return "sync-toast";
}

export function showSyncErrorToast() {
  goeyToast.update("sync-toast", {
    title: "Sync Failed",
    type: "error",
    icon: null,
    showTimestamp: false,
    description: (
      <div className="flex flex-col gap-1 mt-1 w-[260px]">
        <p className="text-[11px] opacity-90 leading-normal">
          Could not sync with the cloud. We will retry when connection stabilizes.
        </p>
      </div>
    ),
  });

  setTimeout(() => {
    goeyToast.dismiss("sync-toast");
  }, 4000);

  return "sync-toast";
}

// ─── NETWORK CONNECTION TOASTS ──────────────────────────────────────

export function showOfflineToast() {
  return goeyToast.warning("Connection Lost", {
    id: "network-toast",
    duration: 86400000, // Persistent until online
    showProgress: false,
    showTimestamp: false,
    classNames: {
      title: "text-sm font-bold leading-none tracking-tight",
    },
    description: (
      <div className="flex flex-col gap-1 mt-1 w-[260px]">
        <p className="text-[11px] opacity-90 leading-normal">
          You are now offline. Changes will be saved locally.
        </p>
      </div>
    ),
  });
}

export function showOnlineToast() {
  goeyToast.update("network-toast", {
    title: "Back Online",
    type: "success",
    showTimestamp: false,
    description: (
      <div className="flex flex-col gap-1 mt-1 w-[260px]">
        <p className="text-[11px] opacity-90 leading-normal">
          Connection restored! Syncing your changes now...
        </p>
      </div>
    ),
  });

  setTimeout(() => {
    goeyToast.dismiss("network-toast");
  }, 3000);

  return "network-toast";
}

// ─── GENERAL AI LOADER TOASTS ────────────────────────────────────────

export function showAILoaderToast(id: string, title: string, descriptionText: string) {
  return goeyToast(title, {
    id,
    duration: 60000,
    showProgress: false,
    showTimestamp: false,
    icon: <LoaderCircleIcon className="h-4 w-4 animate-spin text-white/80" />,
    classNames: {
      title: "text-sm font-bold leading-none tracking-tight",
      description: "text-[11px] opacity-90 leading-normal",
    },
    description: (
      <div className="flex flex-col gap-1 mt-1 w-[260px]">
        <p className="text-[11px] opacity-90 leading-normal">{descriptionText}</p>
      </div>
    ),
  });
}

export function updateAISuccessToast(id: string, title: string, descriptionText: string) {
  goeyToast.update(id, {
    title,
    type: "success",
    icon: null,
    showTimestamp: false,
    description: (
      <div className="flex flex-col gap-1 mt-1 w-[260px]">
        <p className="text-[11px] opacity-90 leading-normal">{descriptionText}</p>
      </div>
    ),
  });

  setTimeout(() => {
    goeyToast.dismiss(id);
  }, 4000);
}

export function updateAIErrorToast(id: string, title: string, descriptionText: string) {
  goeyToast.update(id, {
    title,
    type: "error",
    icon: null,
    showTimestamp: false,
    description: (
      <div className="flex flex-col gap-1 mt-1 w-[260px]">
        <p className="text-[11px] opacity-90 leading-normal">{descriptionText}</p>
      </div>
    ),
  });

  setTimeout(() => {
    goeyToast.dismiss(id);
  }, 5000);
}

// ─── SIGN OUT CONFIRM TOAST ──────────────────────────────────────────

interface ShowSignOutConfirmToastProps {
  onConfirm: () => void;
}

export function showSignOutConfirmToast({ onConfirm }: ShowSignOutConfirmToastProps) {
  const toastId = goeyToast.warning("Sign Out", {
    id: "signout-confirm-toast",
    duration: 15000,
    timing: {
      displayDuration: 15000,
    },
    showProgress: false,
    showTimestamp: false,
    classNames: {
      title: "text-sm font-bold leading-none tracking-tight",
    },
    description: (
      <div className="flex flex-col gap-2 mt-1 w-[260px]">
        <p className="text-[11px] opacity-90 leading-normal text-zinc-600 dark:text-white/90">
          Your notes are safely synced to the cloud, but local media files will be permanently deleted.
        </p>
        
        <div className="flex flex-col gap-1.5 mt-1.5 w-full">
          <button
            onClick={() => {
              onConfirm();
              goeyToast.dismiss("signout-confirm-toast");
            }}
            className="flex items-center gap-2.5 w-full p-2 rounded-xl bg-red-500/10 dark:bg-red-500/20 hover:bg-red-500/20 dark:hover:bg-red-500/30 text-left transition-colors cursor-pointer border border-red-500/10"
          >
            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-200 shadow-sm flex-shrink-0">
              <LogoutIcon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-red-600 dark:text-red-100 leading-none">Sign Out & Delete Media</p>
              <p className="text-[9.5px] text-red-500/70 dark:text-red-200/70 truncate mt-0.5">Confirm and log out of your account</p>
            </div>
          </button>

          <button
            onClick={() => goeyToast.dismiss("signout-confirm-toast")}
            className="flex items-center gap-2.5 w-full p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-left transition-colors cursor-pointer border border-black/5 dark:border-white/5"
          >
            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-black/10 dark:bg-white/10 text-zinc-700 dark:text-white shadow-sm flex-shrink-0">
              <DeleteIcon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-zinc-800 dark:text-white/90 leading-none">Cancel</p>
              <p className="text-[9.5px] text-zinc-500 dark:text-white/60 truncate mt-0.5">Stay logged in</p>
            </div>
          </button>
        </div>
      </div>
    )
  });

  return toastId;
}



