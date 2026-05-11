import { motion } from "framer-motion";
import { useState, useRef, useEffect, useCallback } from "react";
import { SendIcon, XIcon, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { LoaderIcon } from "@/components/ui/loader";
import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";

interface SupportActionSheetProps {
  onClose: () => void;
}

const SUPPORT_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbww8SxkxrSOYScJNdtkhorXTqIQ10qVT8WHRgHXnrCRjyYbYhfHLWlta97sFzVk8o0pSA/exec";

export function SupportActionSheet({ onClose }: SupportActionSheetProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [dotLottie, setDotLottie] = useState<DotLottie | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => { autoResize(); }, [content, autoResize]);

  useEffect(() => {
    if (!dotLottie) return;
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
  }, [dotLottie]);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) return;
    setStatus("loading");
    
    try {
      const response = await fetch(SUPPORT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          name: user?.displayName || "Guest User",
          email: user?.email || "guest@blacknote.com",
          title: title,
          content: content
        })
      });

      // GAS often returns HTML via a 302 redirect after success
      const text = await response.text();
      let isSuccess = false;
      
      try {
        const data = JSON.parse(text);
        if (data.status === "success") isSuccess = true;
      } catch {
        if (response.ok) isSuccess = true;
      }

      if (isSuccess) {
        setStatus("success");
      } else {
        throw new Error("Failed to send");
      }
    } catch (err: any) {
      console.error("Support submission failed:", err);
      setStatus("error");
      setErrorMessage(err.message || "Network error. Please try again.");
    }
  };

  return (
    <>
      <motion.div
        className="history-sheet-backdrop"
        onClick={status === "loading" ? undefined : onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{ zIndex: 100 }}
      />

      <motion.div
        className="clipper-sheet mx-auto account-sheet"
        style={{ maxWidth: 500, zIndex: 101 }}
        initial={{ bottom: "-100%" }}
        animate={{ bottom: 0 }}
        exit={{ bottom: "-100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 350, mass: 0.8 }}
      >
        <div className="history-sheet-handle" onClick={status === "loading" ? undefined : onClose}>
          <div className="history-sheet-handle-bar" />
        </div>

        <div className="relative px-4 pb-5 pt-4">
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

          {status === "success" || status === "error" ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${status === "success" ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"}`}>
                {status === "success" ? <CheckCircle2 size={32} /> : <XIcon size={32} />}
              </div>
              <h3 className="text-lg font-bold text-foreground mb-1">
                {status === "success" ? "Message Sent!" : "Failed to Send"}
              </h3>
              <p className="text-sm text-muted-foreground text-center mb-6">
                {status === "success" 
                  ? "Thank you for your feedback. We'll get back to you soon."
                  : "We encountered an issue while sending your message. Please try again."}
              </p>
              <button
                onClick={status === "success" ? onClose : () => setStatus("idle")}
                className="w-full h-[44px] rounded-[20px] bg-primary text-primary-foreground font-medium flex items-center justify-center transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {status === "success" ? "Close" : "Try Again"}
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 pt-3">
                <h3 className="text-[17px] font-bold text-foreground tracking-tight text-center">Contact Support</h3>
              </div>

              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Subject"
                  className="w-full bg-muted/30 border border-border/50 rounded-xl px-3 py-3 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
                  disabled={status === "loading"}
                />
                
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="How can we help you?"
                  className="w-full bg-muted/30 border border-border/50 rounded-xl px-3 py-3 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors resize-none min-h-[100px]"
                  disabled={status === "loading"}
                />

                <button
                  onClick={handleSubmit}
                  disabled={!title.trim() || !content.trim() || status === "loading"}
                  className="w-full h-[44px] mt-2 rounded-[20px] bg-transparent border border-border/80 text-foreground font-medium flex items-center justify-center gap-2 transition-all hover:bg-muted/30 active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed shadow-sm"
                >
                  {status === "loading" ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                      <LoaderIcon size={16} />
                    </motion.div>
                  ) : (
                    <>
                      <SendIcon size={15} />
                      Send Message
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}
