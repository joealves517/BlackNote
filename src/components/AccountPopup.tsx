import React, { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";
import { SparklesIcon } from "@/components/icons/sparkles";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import { LogoutIcon } from "@/components/icons/logout";
import { CircleCheckIcon } from "@/components/icons/circle-check";
import { LoaderIcon } from "@/components/ui/loader";

import { MessageSquare, PenLine, Mic, Wand2, Zap, Minus, Video, HelpCircle } from "lucide-react";
import { CHECKOUT_BASE } from "@/lib/constants";
import type { AppUser } from "@/lib/auth-client";

interface AccountPopupProps {
  user: AppUser | null;
  credits: { credits: number; tier: string } | null;
  proIconIndex?: number;
  onSignOut: () => void;
  onLogin?: () => void;
  isLoggingIn?: boolean;
  onClose: () => void;
  onRefreshCredits?: () => void;
  guestTitle?: string;
  guestSubtitle?: string;
}

const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

function getUserAvatar(user: AppUser): string | null {
  return user.picture || null;
}

function getUserDisplayName(user: AppUser): string {
  return user.displayName || user.email || "User";
}

const AIFeatureItem = ({ icon, title, description, available, colorRgb = "59, 130, 246", isLast = false, isGuest = false }: any) => {
  const [hovered, setHovered] = useState(false);
  return (
    <>
      <div 
        role="button"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          padding: "12px 14px",
          borderRadius: "14px",
          background: hovered
            ? `linear-gradient(90deg, rgba(${colorRgb}, 0) 0%, rgba(${colorRgb}, 0.08) 30%, rgba(${colorRgb}, 0.08) 70%, rgba(${colorRgb}, 0) 100%)`
            : `linear-gradient(90deg, rgba(${colorRgb}, 0) 0%, rgba(${colorRgb}, 0.04) 30%, rgba(${colorRgb}, 0.04) 70%, rgba(${colorRgb}, 0) 100%)`,
          transition: "all 0.25s ease",
          cursor: "pointer",
          transform: hovered ? "scale(1.01)" : "scale(1)",
        }}
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
      >
        <div style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "38px",
          height: "38px",
          borderRadius: "10px",
          background: `linear-gradient(135deg, rgba(${colorRgb}, var(--icon-bg-start)) 0%, rgba(${colorRgb}, var(--icon-bg-end)) 100%)`,
          border: `1px solid rgba(${colorRgb}, var(--icon-border))`,
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.5)",
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="text-[13px] font-semibold text-foreground leading-snug">{title}</div>
          <div className="text-[11.5px] text-muted-foreground leading-snug mt-[2px]">{description}</div>
        </div>
        {available && (
          <div style={{
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            background: isGuest ? "rgba(255, 255, 255, var(--icon-bg-end))" : "rgba(52, 211, 153, var(--icon-border))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: isGuest ? "1px solid rgba(255, 255, 255, var(--icon-border))" : "none"
          }}>
            <AnimatedIcon animation="none">
              {isGuest ? (
                <Minus size={14} color="#888" strokeWidth={2.5} style={{ display: "flex", alignItems: "center", justifyContent: "center" }} />
              ) : (
                <CircleCheckIcon size={14} color="#10B981" strokeWidth={2.5} style={{ display: "flex", alignItems: "center", justifyContent: "center" }} />
              )}
            </AnimatedIcon>
          </div>
        )}
      </div>
      {!isLast && (
        <div style={{
          height: "1px",
          width: "85%",
          margin: "0 auto",
          background: `linear-gradient(90deg, rgba(${colorRgb}, 0) 0%, rgba(${colorRgb}, 0.15) 50%, rgba(${colorRgb}, 0) 100%)`,
        }} />
      )}
    </>
  );
};

const FeatureList = ({ isPro, quotaExhausted, isGuest = false }: { isPro: boolean, quotaExhausted: boolean, isGuest?: boolean }) => (
  <div className="flex flex-col mb-3.5">
    <AIFeatureItem
      icon={<AnimatedIcon animation="none"><MessageSquare className="text-blue-500 w-5 h-5 flex items-center justify-center" strokeWidth={1.5} /></AnimatedIcon>}
      title="Chat with Note"
      description={isPro && !quotaExhausted ? "Powered by Gemini Nano" : "Limited usage"}
      available={true}
      colorRgb="59, 130, 246"
      isGuest={isGuest}
    />
    <AIFeatureItem
      icon={<AnimatedIcon animation="none"><Video className="text-purple-500 w-5 h-5 flex items-center justify-center" strokeWidth={1.5} /></AnimatedIcon>}
      title="Chat with Video/Audio"
      description={isPro && !quotaExhausted ? "Deep media insights" : "Limited usage"}
      available={true}
      colorRgb="168, 85, 247"
      isGuest={isGuest}
    />
    <AIFeatureItem
      icon={<AnimatedIcon animation="none"><Wand2 className="text-amber-500 w-5 h-5 flex items-center justify-center" strokeWidth={1.5} /></AnimatedIcon>}
      title="AI Summarization"
      description={isPro && !quotaExhausted ? "Extract key insights" : "Limited usage"}
      available={true}
      colorRgb="245, 158, 11"
      isGuest={isGuest}
    />
    <AIFeatureItem
      icon={<AnimatedIcon animation="none"><CircleCheckIcon className="text-emerald-500 w-5 h-5 flex items-center justify-center" strokeWidth={1.5} /></AnimatedIcon>}
      title="Fix Spelling & Grammar"
      description={isPro && !quotaExhausted ? "Professional polish" : "Limited usage"}
      available={true}
      colorRgb="16, 185, 129"
      isLast={true}
      isGuest={isGuest}
    />
  </div>
);

export function AccountPopup({
  user,
  credits,
  onSignOut,
  onLogin,
  isLoggingIn,
  guestTitle,
  guestSubtitle,
  onClose,
}: AccountPopupProps) {
  const isPremium = credits?.tier === "premium";
  const isQuotaExhausted = isPremium && credits?.credits !== undefined && credits.credits <= 0;
  const [logoutHovered, setLogoutHovered] = useState(false);
  const [dotLottie, setDotLottie] = useState<DotLottie | null>(null);

  useEffect(() => {
    if (!dotLottie || user) return;

    const fireJump = () => {
      try {
        if (typeof dotLottie.stateMachineFireEvent === "function") {
          dotLottie.stateMachineFireEvent("jumpClick");
        }
      } catch (err) {}
    };

    const fireYesClick = () => {
      try {
        if (typeof dotLottie.stateMachineFireEvent === "function") {
          dotLottie.stateMachineFireEvent("yesClick");
        }
      } catch (err) {}
    };

    let interval: NodeJS.Timeout;
    const initialTimeout = setTimeout(() => {
      fireJump();
      interval = setInterval(fireYesClick, 3000);
    }, 200);

    return () => {
      clearTimeout(initialTimeout);
      if (interval) clearInterval(interval);
    };
  }, [dotLottie, user]);

  // GUEST VIEW
  if (!user) {
    return (
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
          <h3 className="text-lg font-bold text-foreground mb-1 tracking-tight">{guestTitle || "Unlock AI Features"}</h3>
          <p className="text-xs text-muted-foreground">{guestSubtitle || "Sign in to enhance your note-taking experience."}</p>
        </div>

        <FeatureList isPro={false} quotaExhausted={false} isGuest={true} />

        <button
          onClick={onLogin}
          disabled={isLoggingIn}
          className="relative z-10 w-full h-[40px] rounded-[20px] text-[13.5px] font-medium flex items-center justify-center gap-2 border border-border/80 text-muted-foreground bg-transparent hover:bg-muted/30 hover:text-foreground transition-all active:scale-[0.98] disabled:opacity-70 mt-1"
        >
          {isLoggingIn ? (
            <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="flex">
              <LoaderIcon size={18} className="text-background" />
            </motion.span>
          ) : (
            <GoogleLogo />
          )}
          {isLoggingIn ? "Signing in..." : "Sign in with Google"}
        </button>
      </div>
    );
  }

  // LOGGED IN VIEW
  const firstName = getUserDisplayName(user).split(" ")[0];

  const getGreetingMessage = () => {
    if (isPremium && isQuotaExhausted) return "AI quota exceeded, renews next month";
    if (isPremium) return "Thank you for supporting us! 💜";
    return "Upgrade to unlock unlimited AI features";
  };

  return (
    <div className="relative pt-4 px-4 pb-4">
      {/* Floating Support Button */}
      <button 
        onClick={() => {
          onClose();
          setTimeout(() => window.dispatchEvent(new CustomEvent("open-support-sheet")), 200);
        }}
        className="absolute right-4 -top-[68px] z-20 h-[32px] px-3 rounded-full bg-[hsl(var(--background))] flex items-center justify-center gap-1.5 border border-border/80 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:scale-105 active:scale-95 transition-all shadow-sm"
        title="Contact Support"
      >
        <HelpCircle className="w-[16px] h-[16px]" />
        <span className="text-[12px] font-medium leading-none">Help</span>
      </button>

      {/* Absolute Avatar breaking out */}
      <div className="absolute left-1/2 -top-[68px] -translate-x-1/2 z-10">
        <div className="w-[84px] h-[84px] flex items-center justify-center relative" style={{ clipPath: "inset(-100% -100% 0 -100%)" }}>
          {getUserAvatar(user) ? (
            <img src={getUserAvatar(user)!} alt={firstName} className="w-[76px] h-[76px] object-cover rounded-full bg-transparent" />
          ) : (
            <div className="w-[76px] h-[76px] bg-muted/80 backdrop-blur-md rounded-full flex items-center justify-center">
              <span className="text-3xl font-bold text-muted-foreground">{firstName.charAt(0).toUpperCase()}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-start justify-between pt-2 pb-3.5 px-2 relative z-10">
        <div className="flex-1 min-w-0">
          <div className="text-[18px] font-bold text-foreground tracking-tight leading-snug">
            Hello, {firstName} 👋
          </div>
          <div className="text-[12.5px] text-muted-foreground mt-1 leading-snug">
            {getGreetingMessage()}
          </div>
        </div>

        <div className="shrink-0 ml-3 mt-0.5">
          {isPremium ? (
            <div className="flex items-center justify-center" style={{ width: "64px", height: "64px", marginTop: "-16px", marginRight: "-8px" }}>
              <DotLottieReact src={chrome.runtime.getURL("crown.json")} autoplay loop backgroundColor="transparent" style={{ width: "100%", height: "100%" }} />
            </div>
          ) : (
            <button
              onClick={() => {
                const url = `${CHECKOUT_BASE}?checkout[email]=${encodeURIComponent(user.email || "")}&checkout[custom][user_id]=${user.id}`;
                chrome.tabs.create({ url });
              }}
              className="p-0 border-none bg-transparent hover:scale-105 transition-all active:scale-95"
              style={{ width: "100px", height: "32px", marginTop: "-4px" }}
            >
              <DotLottieReact src={chrome.runtime.getURL("go-premium.json")} autoplay loop backgroundColor="transparent" style={{ width: "100%", height: "100%", pointerEvents: "none" }} />
            </button>
          )}
        </div>
      </div>

      <FeatureList isPro={isPremium} quotaExhausted={isQuotaExhausted} />

      <button
        onClick={onSignOut}
        className="relative z-10 w-full h-10 flex items-center justify-center gap-2 rounded-full text-[13px] font-semibold transition-all"
        style={{
          background: logoutHovered ? "hsl(var(--destructive) / var(--icon-border))" : "transparent",
          color: logoutHovered ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))",
          border: logoutHovered ? "1px solid hsl(var(--destructive) / 0.2)" : "1px solid hsl(var(--border))",
        }}
        onMouseOver={() => setLogoutHovered(true)}
        onMouseOut={() => setLogoutHovered(false)}
        onMouseDown={(e) => e.currentTarget.style.transform = "scale(0.98)"}
        onMouseUp={(e) => e.currentTarget.style.transform = "scale(1)"}
      >
        <AnimatedIcon animation="none">
          <LogoutIcon className="w-4 h-4" />
        </AnimatedIcon>
        Sign out
      </button>
    </div>
  );
}
