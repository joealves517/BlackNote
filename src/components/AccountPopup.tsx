import { CircleHelpIcon } from "@/components/icons/circle-help";
import { LogoutIcon } from "@/components/icons/logout";
import { SparklesIcon } from "@/components/icons/sparkles";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import { ChessKingIcon } from "@/components/icons/chess-king";
import { HandMetalIcon } from "@/components/icons/hand-metal";
import { HeartHandshakeIcon } from "@/components/icons/heart-handshake";

import { Button } from "@/components/ui/button";
import { CHECKOUT_BASE } from "@/lib/constants";
import type { User } from "@supabase/supabase-js";

import { useRef } from "react";

interface AccountPopupProps {
  user: User;
  credits: { credits: number; tier: string } | null;
  proIconIndex?: number;
  onSignOut: () => void;
  onClose: () => void;
  onRefreshCredits?: () => void;
}

function getUserAvatar(user: User): string | null {
  return user.user_metadata?.avatar_url || null;
}

function getUserDisplayName(user: User): string {
  return (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email ||
    "User"
  );
}

export function AccountPopup({
  user,
  credits,
  proIconIndex = 0,
  onSignOut,
  onClose,
}: AccountPopupProps) {
  const isPremium = credits?.tier === "premium";
  const isQuotaExhausted =
    isPremium && credits?.credits !== undefined && credits.credits <= 0;

  const ProIcon = proIconIndex === 0 ? ChessKingIcon : proIconIndex === 1 ? HandMetalIcon : HeartHandshakeIcon;
  const proIconRef = useRef<any>(null);

  return (
    <div className="account-popup">
      {/* User info */}
      <div className="account-popup-profile">
        <div className="account-popup-avatar-wrapper">
          {getUserAvatar(user) ? (
            <img
              src={getUserAvatar(user)!}
              alt={getUserDisplayName(user)}
              className="account-popup-avatar"
            />
          ) : (
            <div className="account-popup-avatar-fallback">
              {getUserDisplayName(user).charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="account-popup-info">
          <p className="account-popup-name">{getUserDisplayName(user)}</p>
          <p className="account-popup-email">{user.email}</p>
        </div>
      </div>

      {/* Quota exhausted warning */}
      {isQuotaExhausted && (
        <div className="account-popup-quota-warning">
          <div className="account-popup-quota-icon">
            <SparklesIcon className="h-3.5 w-3.5 text-yellow-500" />
          </div>
          <div className="account-popup-quota-text">
            <p className="account-popup-quota-title">Fair Use Policy</p>
            <p className="account-popup-quota-desc">
              Premium AI usage limit reached. Using standard AI until next
              renewal.
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="ai-cmd-groups" style={{ padding: "0 8px 8px" }}>
        <div className="ai-cmd-group">
          {!isPremium ? (
            <button
              className="novel-slash-item w-full text-left"
              onClick={() => {
                const url = `${CHECKOUT_BASE}?checkout[email]=${encodeURIComponent(user.email || "")}&checkout[custom][user_id]=${user.id}`;
                chrome.tabs.create({ url });
              }}
            >
              <div className="novel-slash-icon">
                <AnimatedIcon animation="hover">
                  <SparklesIcon className="w-4 h-4 text-yellow-500" />
                </AnimatedIcon>
              </div>
              <div>
                <p className="text-[13px] font-medium">Upgrade to Pro</p>
                <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Unlock unlimited AI features
                </p>
              </div>
            </button>
          ) : (
            <div 
              className="novel-slash-item w-full text-left" 
              style={{ cursor: "default" }}
              onMouseEnter={() => proIconRef.current?.startAnimation()}
              onMouseLeave={() => proIconRef.current?.stopAnimation()}
            >
              <div className="novel-slash-icon" style={{ borderColor: "hsl(45 90% 55% / 0.5)" }}>
                <ProIcon ref={proIconRef} size={16} className="w-4 h-4" style={{ color: "hsl(45 90% 55%)" }} />
              </div>
              <div>
                <p className="text-[13px] font-medium" style={{ color: "hsl(45 90% 55%)" }}>Pro Plan Active</p>
                <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Thanks for supporting BlackNote!
                </p>
              </div>
            </div>
          )}

          <button
            className="novel-slash-item w-full text-left"
            onClick={onSignOut}
          >
            <div className="novel-slash-icon">
              <AnimatedIcon animation="hover">
                <LogoutIcon className="w-4 h-4" />
              </AnimatedIcon>
            </div>
            <div>
              <p className="text-[13px] font-medium">Sign out</p>
              <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                Log out of your account
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
