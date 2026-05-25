import React, { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, HelpCircle, LogOut, FileText, ChevronRight, User as UserIcon, Bell, Check } from "lucide-react";
import { LoaderIcon } from "@/components/ui/loader";
import { PRIVACY_POLICY_URL } from "@/lib/constants";
import type { AppUser } from "@/lib/auth-client";
import { goeyToast } from "goey-toast";
import { dismissSmoothly } from "@/lib/toast";

interface AccountPopupProps {
  user: AppUser | null;
  credits: { credits: number; tier: string } | null;
  onSignOut: () => void;
  onLogin?: () => void;
  isLoggingIn?: boolean;
  onUpgradeClick: () => void;
  onSupportClick: () => void;
  onClose?: () => void;
}

const GoogleLogo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" className="shrink-0">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

export function AccountPopup({
  user,
  credits,
  onSignOut,
  onLogin,
  isLoggingIn,
  onUpgradeClick,
  onSupportClick,
  onClose,
}: AccountPopupProps) {
  const isPremium = credits?.tier === "premium";

  const handleWhatsNewClick = () => {
    const version = chrome.runtime.getManifest()?.version || "0.3.0";
    onClose?.(); // Close popover immediately when toast opens

    const toastId = goeyToast.success(`BlackNote is up to date (v${version}) 🎉`, {
      duration: 30000,
      timing: {
        displayDuration: 30000,
      },
      showProgress: false,
      showTimestamp: false,
      classNames: {
        title: "text-[14px] font-bold leading-none tracking-tight",
      },
      description: (
        <div className="flex flex-col gap-2.5 mt-1 w-[260px]">
          <p className="text-[12px] font-bold text-zinc-800 dark:text-white/90">What's new in this release:</p>
          <ul className="list-disc pl-4 text-[11px] text-zinc-600 dark:text-white/70 space-y-1 leading-normal">
            <li>High-opacity Monochrome Toolbar & dynamic Agent Input</li>
            <li>Ultra-fast Offline Privacy Policy page integration</li>
            <li>Smooth morph-collapse (Gooey) Toast dismissals</li>
            <li>Light mode Toast icon visibility & UI optimization</li>
            <li>Lighter build (-40% size) & redesigned Media Sheet</li>
          </ul>

          <div className="flex flex-col gap-1.5 mt-1.5 w-full">
            <button
              onClick={() => dismissSmoothly(toastId)}
              className="flex items-center gap-2.5 w-full p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/80 text-left transition-colors cursor-pointer border border-zinc-200/60 dark:border-zinc-700/40"
            >
              <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-zinc-200/60 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 shadow-sm flex-shrink-0">
                <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-zinc-800 dark:text-white/90 leading-none">I got it!</p>
                <p className="text-[10px] text-zinc-500 dark:text-white/60 truncate mt-0.5">Dismiss notification</p>
              </div>
            </button>
          </div>
        </div>
      )
    });
  };

  // ─── GUEST VIEW (Not Logged In) ───
  if (!user) {
    return (
      <div className="w-[275px] p-3 flex flex-col gap-3 bg-background text-foreground select-none">
        {/* Top login card - Blue accent, Google logo inside a larger blue circular background */}
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-100/80 dark:bg-zinc-800/60 w-full">
          <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center border border-zinc-200 dark:border-zinc-300/50 shrink-0 shadow-sm">
            <GoogleLogo size={20} />
          </div>
          
          <div className="flex flex-col flex-1 min-w-0 text-left">
            <span className="text-[12px] font-bold text-foreground leading-tight">
              Log in to start
            </span>
            <span className="text-[10px] text-muted-foreground mt-0.5 leading-normal">
              using BlackNote.
            </span>
          </div>

          <button
            onClick={onLogin}
            disabled={isLoggingIn}
            className="h-8 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shrink-0 shadow-sm active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isLoggingIn ? (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="flex shrink-0"
              >
                <LoaderIcon size={12} className="text-white" />
              </motion.span>
            ) : null}
            {isLoggingIn ? "..." : "Log in"}
          </button>
        </div>

        {/* Menu list styled exactly like the screenshot */}
        <div className="flex flex-col gap-0.5">
          <button
            onClick={handleWhatsNewClick}
            className="flex items-center justify-between w-full px-2.5 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted/40 rounded-xl transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <Bell className="w-4 h-4 shrink-0 text-muted-foreground/80 group-hover:text-foreground transition-colors" />
              <span>What's new</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 group-hover:text-foreground/50 transition-colors" />
          </button>

          <button
            onClick={onSupportClick}
            className="flex items-center justify-between w-full px-2.5 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted/40 rounded-xl transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <HelpCircle className="w-4 h-4 shrink-0 text-muted-foreground/80 group-hover:text-foreground transition-colors" />
              <span>Help & Support</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 group-hover:text-foreground/50 transition-colors" />
          </button>

          <button
            onClick={() => {
              onClose?.();
              chrome.tabs.create({ url: chrome.runtime.getURL("privacy-policy.html") });
            }}
            className="flex items-center justify-between w-full px-2.5 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted/40 rounded-xl transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 shrink-0 text-muted-foreground/80 group-hover:text-foreground transition-colors" />
              <span>Privacy Policy</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 group-hover:text-foreground/50 transition-colors" />
          </button>
        </div>
      </div>
    );
  }

  // ─── LOGGED IN VIEW ───
  const userAvatar = user.picture || null;
  const displayName = user.displayName || user.email || "Creator";
  const userEmail = user.email || "";
  const firstName = displayName.split(" ")[0];
  const tierName = credits?.tier || "Free";

  return (
    <div className="w-[275px] p-3 flex flex-col gap-3 bg-background text-foreground select-none">
      {/* Premium user card header */}
      <div className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-100/80 dark:bg-zinc-800/60 w-full">
        <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-border/50 bg-muted flex items-center justify-center">
          {userAvatar ? (
            <img src={userAvatar} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <UserIcon className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        
        <div className="flex flex-col flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-bold text-foreground leading-tight capitalize truncate max-w-[110px]">
              {firstName}
            </span>
            <span className="text-[8px] bg-muted/80 text-muted-foreground px-1.5 py-0.5 rounded border border-border/50 leading-none font-bold uppercase tracking-wider shrink-0 origin-left">
              {tierName}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground mt-0.5 leading-normal truncate w-full">
            {userEmail}
          </span>
        </div>
      </div>

      {/* Upgrade Banner (Visible for Free Tier Users) */}
      {!isPremium && (
        <div className="px-1 flex justify-center">
          <button
            className="w-[92%] relative h-[56px] rounded-xl overflow-hidden group cursor-pointer border-none p-0 outline-none hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 shadow-md"
            onClick={onUpgradeClick}
          >
            <img
              src="/pro-banner.webp"
              alt="Upgrade to Pro"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ease-out"
            />
          </button>
        </div>
      )}

      {/* Menu Actions */}
      <div className="flex flex-col gap-0.5">
        <button
          onClick={handleWhatsNewClick}
          className="flex items-center justify-between w-full px-2.5 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted/40 rounded-xl transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <Bell className="w-4 h-4 shrink-0 text-muted-foreground/80 group-hover:text-foreground transition-colors" />
            <span>What's new</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 group-hover:text-foreground/50 transition-colors" />
        </button>

        <button
          onClick={onSupportClick}
          className="flex items-center justify-between w-full px-2.5 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted/40 rounded-xl transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <HelpCircle className="w-4 h-4 shrink-0 text-muted-foreground/80 group-hover:text-foreground transition-colors" />
            <span>Help & Support</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 group-hover:text-foreground/50 transition-colors" />
        </button>

        <button
          onClick={() => {
            onClose?.();
            chrome.tabs.create({ url: chrome.runtime.getURL("privacy-policy.html") });
          }}
          className="flex items-center justify-between w-full px-2.5 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted/40 rounded-xl transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4 shrink-0 text-muted-foreground/80 group-hover:text-foreground transition-colors" />
            <span>Privacy Policy</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 group-hover:text-foreground/50 transition-colors" />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={onSignOut}
          className="w-full h-9 flex items-center justify-center gap-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border border-border/60 bg-transparent text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 active:scale-[0.98]"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
}
