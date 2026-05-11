/**
 * MediaActionSheet — Clone AccountPopup design with 3 states:
 * 1. Not Analyzed: Robot jump+alert, Play button
 * 2. Processing: Robot thinking, Bouncing Fruits animation, fake status text
 * 3. Analyzed: Robot jump+yes, AI feature list
 *
 * Results displayed via event → AISelector-style result panel (not a separate sheet).
 */

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback, useRef } from "react";
import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";
import { Mic, Monitor, PenLine, Wand2, BookOpen, Tag, Play, ChevronRight, MessageSquare, FileText } from "lucide-react";
import { ArrowUpIcon } from "@/components/icons/arrow-up";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import { CircleCheckIcon } from "@/components/icons/circle-check";
import { AIProcessingView } from "@/components/ui/ai-processing-view";
import { DeleteIcon } from "@/components/icons/delete";
import { db } from "@/lib/local-db";
import { useAuth } from "@/hooks/use-auth";
import {
  analyzeMedia,
  summarizeMedia,
  generateTitle,
  hasTranscript,
  type SummarizeStyle,
} from "@/lib/media-ai-service";

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

type SheetPhase = "idle" | "processing" | "analyzed" | "generating_feature";

const PROCESSING_MESSAGES = [
  "Extracting audio track",
  "Compressing audio",
  "Sending to AI",
  "Transcribing content",
  "Processing segments",
  "Analyzing speech patterns",
  "Building transcript",
  "Almost done",
];

const AI_FEATURES = [
  { id: "meeting_minutes", label: "Meeting Minutes", desc: "Professional minutes with action items", icon: FileText },
  { id: "summary", label: "Summary", desc: "Concise overview of the recording", icon: PenLine },
  { id: "keypoints", label: "Key Points", desc: "Important insights as bullet points", icon: Wand2 },
  { id: "action_items", label: "Action Items", desc: "Extract tasks and to-dos", icon: CircleCheckIcon },
  { id: "chapters", label: "Chapters", desc: "Section breakdown with timestamps", icon: BookOpen },
  { id: "chat", label: "Chat with Recording", desc: "Ask AI anything about this recording", icon: MessageSquare },
];

const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;



// ─── Main Component ──────────────────────────────────────────────

export function MediaActionSheet({
  mediaId, type, noteId, fileName, duration, onDeleteNode, onClose, onInsertToNote, missingBlob
}: MediaActionSheetProps) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<SheetPhase>("idle");
  const [statusMsg, setStatusMsg] = useState(PROCESSING_MESSAGES[0]);
  const [statusIdx, setStatusIdx] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [dotLottie, setDotLottie] = useState<DotLottie | null>(null);
  
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

  // Dev: force phase from console
  useEffect(() => {
    const handler = (e: Event) => {
      const p = (e as CustomEvent).detail as SheetPhase;
      if (p) { setPhase(p); setStatusIdx(0); setStatusMsg(PROCESSING_MESSAGES[0]); }
    };
    window.addEventListener("__test-media-phase", handler);
    return () => window.removeEventListener("__test-media-phase", handler);
  }, []);

  // ─── Robot Lottie state machine ────────────────────────────────

  useEffect(() => {
    if (!dotLottie) return;
    const fire = (evt: string) => {
      try { dotLottie.stateMachineFireEvent?.(evt); } catch {}
    };

    let interval: NodeJS.Timeout;
    if (phase === "idle") {
      const t = setTimeout(() => { fire("jumpClick"); interval = setInterval(() => fire("alertClick"), 3000); }, 200);
      return () => { clearTimeout(t); clearInterval(interval); };
    }
    if (phase === "processing") {
      const t = setTimeout(() => { fire("thinkClick"); interval = setInterval(() => fire("thinkClick"), 1500); }, 500);
      return () => { clearTimeout(t); clearInterval(interval); };
    }
    if (phase === "analyzed") {
      const t = setTimeout(() => { fire("jumpClick"); interval = setInterval(() => fire("yesClick"), 3000); }, 200);
      return () => { clearTimeout(t); clearInterval(interval); };
    }
  }, [dotLottie, phase]);

  // ─── Fake processing messages ──────────────────────────────────

  useEffect(() => {
    if (phase !== "processing") return;
    const timer = setInterval(() => {
      setStatusIdx((prev) => {
        const next = Math.min(prev + 1, PROCESSING_MESSAGES.length - 1);
        setStatusMsg(PROCESSING_MESSAGES[next]);
        return next;
      });
    }, 2200);
    return () => clearInterval(timer);
  }, [phase]);

  // ─── Handlers ──────────────────────────────────────────────────

  const handleAnalyze = useCallback(async () => {
    if (!user) {
      onClose();
      window.dispatchEvent(new CustomEvent("ai-error"));
      return;
    }
    setPhase("processing");
    setStatusIdx(0);
    setStatusMsg(PROCESSING_MESSAGES[0]);
    try {
      await analyzeMedia(mediaId, noteId);
      setPhase("analyzed");
    } catch {
      setPhase("idle");
      onClose();
      window.dispatchEvent(new CustomEvent("ai-error"));
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

    setPhase("generating_feature");
    try {
      let resultText = "";
      const d = await summarizeMedia(mediaId, noteId, id as SummarizeStyle, type);
      resultText = d.text;

      onClose();
      // Dispatch direct insertion event instead of opening result sheet
      window.dispatchEvent(new CustomEvent("insert-media-ai-result", {
        detail: { text: resultText, mediaId },
      }));
    } catch {
      setPhase("analyzed");
      window.dispatchEvent(new CustomEvent("ai-error"));
    }
  }, [mediaId, type, onClose]);

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
        className={`clipper-sheet mx-auto ${phase !== "analyzed" ? "account-sheet" : ""}`}
        style={{ maxWidth: 600 }}
        initial={{ bottom: "-100%" }}
        animate={{ bottom: 0 }}
        exit={{ bottom: "-100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 350, mass: 0.8 }}
      >
        <div className="history-sheet-handle" onClick={onClose}>
          <div className="history-sheet-handle-bar" />
        </div>

        <div className={`relative px-4 pb-4 ${phase !== "analyzed" ? "pt-4" : "pt-1"}`}>
          {/* ─── Header & Robot (Idle Only) ─── */}
          {phase === "idle" && (
            <>
              <div className="absolute left-1/2 -top-[68px] -translate-x-1/2 z-10">
                <div className="w-[84px] h-[84px] flex items-center justify-center relative" style={{ clipPath: "inset(-100% -100% 0 -100%)" }}>
                  <DotLottieReact
                    src={chrome.runtime.getURL("ai-robo.lottie")}
                    autoplay loop stateMachineId="StateMachine1"
                    dotLottieRefCallback={setDotLottie}
                    backgroundColor="transparent"
                    style={{ width: "150%", height: "150%", transform: "scale(1.35) translateY(2%)", position: "absolute" }}
                  />
                </div>
              </div>
              <div className="text-center pt-4 pb-3">
                <h3 className="text-lg font-bold text-foreground mb-1 tracking-tight">
                  {fileName || (type === "audio" ? "Audio Recording" : "Screen Recording")}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {type === "audio" ? "Audio" : "Video"} • {formatTime(duration)}
                </p>
              </div>
            </>
          )}

          {/* ─── Phase: Idle (Not Analyzed) ─── */}
          {phase === "idle" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingBottom: 8 }}>
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

          {/* ─── Phase: Processing (Transcribing) ─── */}
          {phase === "processing" && (
            <AIProcessingView
              title="Analyzing"
              messages={PROCESSING_MESSAGES}
            />
          )}

          {/* ─── Phase: Analyzed (Feature List + Prompt) ─── */}
          {phase === "analyzed" && (
            <motion.div>
              <div className="ai-input-row">
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

              <div className="ai-cmd-groups" style={{ marginBottom: 14 }}>
                <div className="ai-cmd-group">
                {AI_FEATURES.map((option) => (
                  <button
                    key={option.id}
                    className="novel-slash-item w-full text-left"
                    onClick={() => handleFeature(option.id)}
                  >
                    <div className="novel-slash-icon">
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

          {/* ─── Phase: Generating Feature ─── */}
          {phase === "generating_feature" && (
            <AIProcessingView
              title="Generating Insights"
              messages={["Analyzing recording", "Structuring insights", "Formatting result"]}
            />
          )}

          {/* ─── Delete Button (not during processing or generating) ─── */}
          {(phase === "idle" || phase === "analyzed") && (
            <button
              onClick={handleDelete}
              className="w-full h-10 flex items-center justify-center gap-2 rounded-full text-[13px] font-semibold transition-all"
              style={{
                background: deleteConfirm ? "hsl(var(--destructive) / 0.1)" : "transparent",
                color: deleteConfirm ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))",
                border: deleteConfirm ? "1px solid hsl(var(--destructive) / 0.2)" : "1px solid hsl(var(--border))",
              }}
              onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.98)"; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
            >
              <AnimatedIcon animation="none"><DeleteIcon className="w-4 h-4" /></AnimatedIcon>
              {deleteConfirm ? "Confirm Delete" : "Delete Recording"}
            </button>
          )}
        </div>
      </motion.div>
    </>
  );
}
