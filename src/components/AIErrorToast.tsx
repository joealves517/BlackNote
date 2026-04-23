import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Coins, AlertTriangle } from "lucide-react";
import { CHECKOUT_BASE } from "@/lib/constants";



interface AIErrorToastProps {
  visible: boolean;
  isRefund?: boolean;
  onDismiss: () => void;
  isSignedIn: boolean;
  userEmail?: string;
  userId?: string;
  onSignIn: () => void;
}

export function AIErrorToast({
  visible,
  isRefund,
  onDismiss,
  isSignedIn,
  userEmail,
  userId,
  onSignIn,
}: AIErrorToastProps) {

  const checkoutUrl = userId
    ? `${CHECKOUT_BASE}?checkout[email]=${encodeURIComponent(userEmail || "")}&checkout[custom][user_id]=${userId}`
    : CHECKOUT_BASE;

  const handleBuyCredits = () => {
    chrome.tabs.create({ url: checkoutUrl });
    onDismiss();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="ai-error-toast"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        >
          <div className="ai-error-toast-header">
            <AlertTriangle className="ai-error-toast-icon" />
            <span className="ai-error-toast-title">Server is busy</span>
            <button className="ai-error-toast-close" onClick={onDismiss}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="ai-error-toast-msg">
            {isRefund ? (
              "The server encountered an error. Your credit has been refunded. Please try again later."
            ) : (
              <>
                Our free tier is experiencing high traffic.
                {!isSignedIn && " Sign in and "}
                {isSignedIn ? " Upgrade " : " upgrade "}
                for stable, priority access.
              </>
            )}
          </p>
          <div className="ai-error-toast-actions">
            {isRefund ? (
              <button className="ai-error-toast-btn ai-error-toast-btn-primary" onClick={onDismiss}>
                Got it
              </button>
            ) : !isSignedIn ? (
              <button className="ai-error-toast-btn ai-error-toast-btn-secondary" onClick={onSignIn}>
                <GoogleMiniIcon />
                Sign in
              </button>
            ) : (
              <button className="ai-error-toast-btn ai-error-toast-btn-primary" onClick={handleBuyCredits}>
                <Coins className="h-3.5 w-3.5 text-yellow-500" />
                Upgrade
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function GoogleMiniIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}
