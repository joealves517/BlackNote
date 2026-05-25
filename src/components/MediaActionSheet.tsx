/**
 * MediaActionSheet — Redesigned to perfectly match AI Selector sheet:
 * - Includes the top drag handle bar (gạch ngang ở trên cùng).
 * - No cutout hole (flat design).
 * - Starts directly with the AI input row.
 * - Vertical list of AI features.
 * - Underneath is ONLY the "Delete File" button (100% width, no Cancel button).
 * - Closes automatically when user clicks outside (backdrop).
 */

import { motion } from "framer-motion";
import { useState, useEffect, useCallback, useRef } from "react";
import { PenLine, Wand2, BookOpen, Play, MessageSquare, FileText } from "lucide-react";
import { ArrowUpIcon } from "@/components/icons/arrow-up";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import { CircleCheckIcon } from "@/components/icons/circle-check";
import { DeleteIcon } from "@/components/icons/delete";
import { db } from "@/lib/local-db";
import { useAuth } from "@/hooks/use-auth";
import {
  analyzeMedia,
  summarizeMedia,
  hasTranscript,
  type SummarizeStyle,
} from "@/lib/media-ai-service";
import { showAILoaderToast, updateAISuccessToast, updateAIErrorToast } from "@/lib/toast";

interface MediaActionSheetProps {
  mediaId: string;
  type: "audio" | "video";
  noteId: string;
  fileName: string;
  duration: number;
  onDeleteNode: () => void;
  onClose: () => void;
  onInsertToNote?: (text: string) => void;
  missingBlob?: boolean;
}

type SheetPhase = "idle" | "analyzed";

const AI_FEATURES = [
  { id: "summary", label: "Summary", desc: "Concise overview of the recording", icon: PenLine, colorRgb: "245, 158, 11" },
  { id: "meeting_minutes", label: "Minutes", desc: "Professional minutes with action items", icon: FileText, colorRgb: "99, 102, 241" },
  { id: "keypoints", label: "Key Points", desc: "Important insights as bullet points", icon: Wand2, colorRgb: "168, 85, 247" },
  { id: "action_items", label: "Tasks", desc: "Extract tasks and to-dos", icon: CircleCheckIcon, colorRgb: "16, 185, 129" },
  { id: "chapters", label: "Chapters", desc: "Section breakdown with timestamps", icon: BookOpen, colorRgb: "59, 130, 246" },
  { id: "chat", label: "Chat AI", desc: "Ask AI anything about this recording", icon: MessageSquare, colorRgb: "236, 72, 153" },
];

const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function MediaActionSheet({
  mediaId, type, noteId, fileName, duration, onDeleteNode, onClose, onInsertToNote, missingBlob
}: MediaActionSheetProps) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<SheetPhase>("idle");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  
  const [inputValue, setInputValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check analyzed on mount (using noteId for synced transcripts)
  useEffect(() => {
    hasTranscript(mediaId, noteId).then((yes) => { if (yes) setPhase("analyzed"); });
  }, [mediaId, noteId]);

  // Listen for background auto-transcription progress (auto-switch to analyzed)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.mediaId === mediaId && detail?.step === "done") {
        setPhase("analyzed");
      }
    };
    window.addEventListener("bg-transcribe-progress", handler);
    return () => window.removeEventListener("bg-transcribe-progress", handler);
  }, [mediaId]);

  // ─── Handlers ──────────────────────────────────────────────────

  const handleAnalyze = useCallback(async () => {
    if (!user) {
      onClose();
      window.dispatchEvent(new CustomEvent("ai-error"));
      return;
    }
    
    const toastId = `media-analyze-toast-${Date.now()}`;
    onClose(); // Close sheet immediately!

    showAILoaderToast(toastId, "Analyze Recording", "Transcribing and extracting insights...");

    try {
      await analyzeMedia(mediaId, noteId);
      updateAISuccessToast(toastId, "Analyze Recording", "Recording analyzed successfully! AI features are now unlocked.");
    } catch (err) {
      console.error("[MediaActionSheet] Analyze failed:", err);
      updateAIErrorToast(toastId, "Analyze Recording", "Failed to analyze recording. Please try again.");
    }
  }, [mediaId, noteId, user, onClose]);

  const handleFeature = useCallback(async (id: string, customPrompt?: string) => {
    if (id === "chat" || customPrompt) {
      onClose();
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("open-note-chat"));
        if (customPrompt) {
          // Pre-fill the chat input via a new event that NoteChatSheet will listen to
          setTimeout(() => window.dispatchEvent(new CustomEvent("set-chat-input", { detail: customPrompt })), 100);
        }
      }, 150);
      return;
    }

    const featureLabel = AI_FEATURES.find(f => f.id === id)?.label || "Insights";
    const toastId = `media-feature-toast-${Date.now()}`;
    onClose(); // Close sheet immediately!

    showAILoaderToast(toastId, featureLabel, "Structuring insights and formatting results...");

    try {
      const data = await summarizeMedia(mediaId, noteId, id as SummarizeStyle, type);
      // Dispatch show result event instead of direct insertion
      window.dispatchEvent(new CustomEvent("show-media-ai-result", {
        detail: { text: data.text, mediaId, title: featureLabel },
      }));
      updateAISuccessToast(toastId, featureLabel, `${featureLabel} generated successfully!`);
    } catch (err) {
      console.error("[MediaActionSheet] Feature generation failed:", err);
      updateAIErrorToast(toastId, featureLabel, `Failed to generate ${featureLabel}. Please try again.`);
    }
  }, [mediaId, type, onClose, noteId]);

  const handleDelete = async () => {
    if (deleteConfirm) {
      onDeleteNode();
      db.media_files.delete(mediaId).catch(() => {});
      db.media_transcripts.delete(mediaId).catch(() => {});
      
      try {
        const note = await db.notes.get(noteId);
        if (note && note.mediaTranscripts) {
          const transcripts = JSON.parse(note.mediaTranscripts);
          if (transcripts[mediaId]) {
            delete transcripts[mediaId];
            await db.notes.update(noteId, { mediaTranscripts: JSON.stringify(transcripts) });
          }
        }
      } catch (err) {
        console.error("Failed to delete transcript from note", err);
      }

      onClose();
    } else {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 3000);
    }
  };

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => { autoResize(); }, [inputValue, autoResize]);

  // Focus text area when changing to analyzed phase
  useEffect(() => {
    if (phase === "analyzed") {
      requestAnimationFrame(() => {
        textareaRef.current?.focus({ preventScroll: true });
      });
    }
  }, [phase]);

  // ─── Render ────────────────────────────────────────────────────

  return (
    <>
      <motion.div
        className="history-sheet-backdrop"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />

      <motion.div
        className="clipper-sheet mx-auto"
        style={{ maxWidth: 400, borderRadius: "24px 24px 0 0" }}
        initial={{ bottom: "-100%" }}
        animate={{ bottom: 0 }}
        exit={{ bottom: "-100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 350, mass: 0.8 }}
      >
        {/* Drag Handle Bar (Gạch ngang mỏng ở trên cùng) */}
        <div className="history-sheet-handle" onClick={onClose}>
          <div className="history-sheet-handle-bar" />
        </div>

        <div className="px-4 pb-4 pt-1 flex flex-col gap-3">
          {/* ─── Phase: Idle (Not Analyzed) ─── */}
          {phase === "idle" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "16px 0 8px" }}>
              <button
                onClick={handleAnalyze}
                style={{
                  position: "relative", width: 72, height: 72, borderRadius: "50%", border: "none",
                  background: "transparent", cursor: "pointer", transition: "transform 0.2s",
                  padding: 0, display: "flex", alignItems: "center", justifyContent: "center",
                }}
                onMouseOver={(e) => { e.currentTarget.style.transform = "scale(1.08)"; }}
                onMouseOut={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.95)"; }}
                onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1.08)"; }}
              >
                <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2.5px solid rgba(52,211,153,0.35)", background: "radial-gradient(circle, rgba(52,211,153,0.08) 0%, transparent 70%)" }} />
                <div style={{ position: "absolute", inset: 4, borderRadius: "50%", border: "2px solid rgba(52,211,153,0.15)" }} />
                <Play size={30} fill="rgb(52,211,153)" color="rgb(52,211,153)" style={{ marginLeft: 3, filter: "drop-shadow(0 0 8px rgba(52,211,153,0.4))" }} />
              </button>
              <div style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground))" }}>Analyze with AI</div>
              <div style={{ fontSize: 11.5, color: "hsl(var(--muted-foreground))" }}>Transcribe to unlock AI features</div>
            </div>
          )}

          {/* ─── Phase: Analyzed (AI Select Text style - Input and List starts directly) ─── */}
          {phase === "analyzed" && (
            <motion.div className="flex flex-col gap-3">
              {/* Input row directly at the top */}
              <div className="ai-input-row" style={{ marginTop: 2 }}>
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  rows={1}
                  placeholder="Ask AI to edit, translate, summarize..."
                  className="ai-input"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && inputValue.trim()) {
                      e.preventDefault();
                      handleFeature("chat", inputValue);
                    }
                  }}
                />
                <button
                  className="ai-send-btn"
                  onClick={() => handleFeature("chat", inputValue)}
                  disabled={!inputValue.trim()}
                >
                  <ArrowUpIcon className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Vertical list of AI features */}
              <div className="ai-cmd-groups">
                <div className="ai-cmd-group">
                  {AI_FEATURES.map((option) => (
                    <button
                      key={option.id}
                      className="novel-slash-item w-full text-left"
                      onClick={() => handleFeature(option.id)}
                    >
                      <div className="novel-slash-icon" style={{
                        background: `linear-gradient(135deg, rgba(${option.colorRgb}, var(--icon-bg-start)) 0%, rgba(${option.colorRgb}, var(--icon-bg-end)) 100%)`,
                        border: `1px solid rgba(${option.colorRgb}, var(--icon-border))`,
                        color: `rgba(${option.colorRgb}, 1)`,
                      }}>
                        <AnimatedIcon animation="hover">
                          <option.icon className="h-4 w-4" />
                        </AnimatedIcon>
                      </div>
                      <div>
                        <p className="text-[13px] font-medium">{option.label}</p>
                        <p className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                          {option.desc}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ─── Compact Delete Action 100% width (Dạng thường) ─── */}
          {(phase === "idle" || phase === "analyzed") && (
            <div className="w-full mt-1">
              <button
                onClick={handleDelete}
                className="w-full h-10 flex items-center justify-center gap-2 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700/40 transition-colors cursor-pointer text-xs font-semibold"
                style={{
                  background: deleteConfirm ? "hsl(var(--destructive) / 0.1)" : "",
                  color: deleteConfirm ? "hsl(var(--destructive))" : "",
                  borderColor: deleteConfirm ? "hsl(var(--destructive) / 0.2)" : "",
                }}
              >
                <AnimatedIcon animation="none">
                  <DeleteIcon className={`w-3.5 h-3.5 ${deleteConfirm ? "text-red-500" : "text-zinc-500"}`} />
                </AnimatedIcon>
                {deleteConfirm ? "Confirm Delete" : "Delete File"}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
