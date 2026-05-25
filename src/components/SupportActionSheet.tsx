import { motion } from "framer-motion";
import { useState, useRef, useEffect, useCallback } from "react";
import { SendIcon } from "lucide-react";

interface SupportActionSheetProps {
  onClose: () => void;
  onSubmit: (title: string, content: string) => void;
}

export function SupportActionSheet({ onClose, onSubmit }: SupportActionSheetProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => { autoResize(); }, [content, autoResize]);

  const handleSubmit = () => {
    if (!title.trim() || !content.trim()) return;
    onSubmit(title, content);
  };

  return (
    <>
      <motion.div
        className="history-sheet-backdrop"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{ zIndex: 100 }}
      />

      <motion.div
        className="clipper-sheet mx-auto"
        style={{ maxWidth: 400, zIndex: 101 }}
        initial={{ bottom: "-100%" }}
        animate={{ bottom: 0 }}
        exit={{ bottom: "-100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 350, mass: 0.8 }}
      >
        <div className="history-sheet-handle" onClick={onClose}>
          <div className="history-sheet-handle-bar" />
        </div>

        <div className="px-4 pb-5 pt-2">
          <div className="mb-4 pt-1">
            <h3 className="text-[17px] font-bold text-foreground tracking-tight text-center">Contact Support</h3>
          </div>

          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Subject"
              className="w-full bg-muted/30 border border-border/50 rounded-xl px-3 py-3 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors"
            />
            
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="How can we help you?"
              className="w-full bg-muted/30 border border-border/50 rounded-xl px-3 py-3 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-colors resize-none min-h-[100px]"
            />

            <button
              onClick={handleSubmit}
              disabled={!title.trim() || !content.trim()}
              className="w-full h-10 mt-1 flex items-center justify-center gap-2 rounded-full text-[13px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              style={{
                background: "hsl(var(--primary))",
                color: "hsl(var(--primary-foreground))",
                border: "1px solid hsl(var(--border))",
                boxShadow: "0 1px 2px rgba(0, 0, 0, var(--icon-bg-end)), inset 0 -2px 0 rgba(0,0,0,0.02)",
              }}
              onMouseOver={(e) => { if (!title.trim() || !content.trim()) return; e.currentTarget.style.opacity = "0.9"; }}
              onMouseOut={(e) => { if (!title.trim() || !content.trim()) return; e.currentTarget.style.opacity = "1"; }}
              onMouseDown={(e) => { if (!title.trim() || !content.trim()) return; e.currentTarget.style.transform = "scale(0.98)"; }}
              onMouseUp={(e) => { if (!title.trim() || !content.trim()) return; e.currentTarget.style.transform = "scale(1)"; }}
            >
              <SendIcon size={15} />
              Send Message
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
