import { LoaderCircleIcon } from "@/components/icons/loader-circle";
import { PlusIcon } from "@/components/icons/plus";
import { FileTextIcon } from "@/components/icons/file-text";
import { SearchIcon } from "@/components/icons/search";
import { XIcon } from "@/components/icons/x";
import { CheckIcon } from "@/components/icons/check";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import type { Note } from "@/hooks/use-notes";
import { PinOff } from "lucide-react";
import { ArrowDownUpIcon } from "@/components/icons/arrow-down-up";
import { PinIcon } from "@/components/animate-ui/icons/pin";

interface HistorySheetProps {
  notes: Note[];
  activeNoteId: string;
  loading?: boolean;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onClose: () => void;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const NOTE_COLORS = [
  "59, 130, 246",  // blue
  "16, 185, 129",  // green
  "245, 158, 11",  // amber
  "168, 85, 247",  // purple
  "236, 72, 153",  // pink
  "99, 102, 241"   // indigo
];

function getNoteColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return NOTE_COLORS[Math.abs(hash) % NOTE_COLORS.length];
}

export function HistorySheet({
  notes,
  activeNoteId,
  loading,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onTogglePin,
  onClose,
}: HistorySheetProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"updated" | "created" | "title">("updated");
  const searchRef = useRef<HTMLInputElement>(null);

  // Auto-focus search on open
  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 100);
  }, []);

  const filteredNotes = (searchQuery
    ? notes.filter((n) =>
        n.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : notes).sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      if (sortMode === "updated") return b.updatedAt.getTime() - a.updatedAt.getTime();
      if (sortMode === "created") return b.createdAt.getTime() - a.createdAt.getTime();
      if (sortMode === "title") return a.title.localeCompare(b.title);
      return 0;
    });

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="history-sheet-backdrop"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />

      {/* Bottom Sheet */}
      <motion.div
        className="history-sheet"
        initial={{ bottom: "-100%" }}
        animate={{ bottom: 0 }}
        exit={{ bottom: "-100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 350, mass: 0.8 }}
      >
        {/* Drag Handle */}
        <div className="history-sheet-handle" onClick={onClose}>
          <div className="history-sheet-handle-bar" />
        </div>

        {/* Search */}
        <div className="history-sheet-search">
          <SearchIcon
            className="history-sheet-search-icon"
            style={{ color: "hsl(var(--muted-foreground))" }}
          />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="history-sheet-search-input"
          />
        </div>

        {/* Content */}
        <div className="history-sheet-content">
          {/* New Note button */}
          <button
            onClick={() => {
              onCreateNote();
              onClose();
            }}
            className="history-sheet-new-note"
          >
            <PlusIcon className="w-5 h-5" style={{ color: "hsl(var(--foreground))" }} />
            <span>New note</span>
          </button>

          {/* Section label */}
          <div className="history-sheet-section-label">
            <span>Notes</span>
            <button
              onClick={() => {
                const modes: ("updated" | "created" | "title")[] = ["updated", "created", "title"];
                const nextIndex = (modes.indexOf(sortMode) + 1) % modes.length;
                setSortMode(modes[nextIndex]);
              }}
              className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors bg-transparent border-none cursor-pointer p-0"
              title="Change sort order"
            >
              <ArrowDownUpIcon size={14} className="w-3.5 h-3.5" />
              <span className="w-[52px] text-left">
                {sortMode === "updated" ? "Updated" : sortMode === "created" ? "Created" : "Title"}
              </span>
            </button>
          </div>

          {/* Notes list */}
          <div className="history-sheet-list">
            {loading ? (
              <div className="history-sheet-empty">
                <LoaderCircleIcon
                  className="h-5 w-5 animate-spin"
                  style={{ color: "hsl(var(--muted-foreground) / 0.5)" }}
                />
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="history-sheet-empty">
                <FileTextIcon
                  className="h-6 w-6"
                  style={{ color: "hsl(var(--muted-foreground) / 0.3)" }}
                />
                <span>
                  {searchQuery ? "No notes found" : "No notes yet"}
                </span>
              </div>
            ) : (
              filteredNotes.map((note) => {
                const isActive = note.id === activeNoteId;
                const noteColor = getNoteColor(note.id);
                const timeStr = formatRelativeTime(note.updatedAt);
                const isRecent = timeStr === "Just now" || timeStr.endsWith("m ago");

                return (
                  <button
                    key={note.id}
                    onClick={() => {
                      onSelectNote(note.id);
                      onClose();
                    }}
                    className="history-sheet-item group"
                    style={isActive ? {
                      backgroundColor: `rgba(${noteColor}, 0.08)`,
                      boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 1px 2px rgba(0,0,0,0.02)",
                      border: `1px solid rgba(${noteColor}, 0.15)`
                    } : {}}
                  >
                    <div className="history-sheet-item-left relative flex items-center">
                      <div 
                        className="flex items-center justify-center shrink-0 w-6 h-6 rounded-[8px] cursor-pointer mr-1 transition-all"
                        style={isActive ? {
                          background: `linear-gradient(135deg, rgba(${noteColor}, var(--icon-bg-start)) 0%, rgba(${noteColor}, var(--icon-bg-end)) 100%)`,
                          border: `1px solid rgba(${noteColor}, var(--icon-border))`,
                          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.5)",
                          color: `rgba(${noteColor}, 1)`
                        } : {
                          color: "hsl(var(--muted-foreground))"
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onTogglePin) onTogglePin(note.id);
                        }}
                      >
                        {note.isPinned ? (
                          <>
                            <PinIcon
                              size={14}
                              className="w-3.5 h-3.5 text-yellow-500 block group-hover:hidden"
                              style={{ fill: "currentColor" }}
                            />
                            <PinOff
                              className="w-3.5 h-3.5 text-red-500 hidden group-hover:block"
                            />
                          </>
                        ) : (
                          <>
                            <FileTextIcon
                              className="w-3.5 h-3.5 block group-hover:hidden"
                              style={{ color: isActive ? `rgba(${noteColor}, 1)` : "inherit" }}
                            />
                            <PinIcon
                              size={14}
                              className="w-3.5 h-3.5 hidden group-hover:block"
                            />
                          </>
                        )}
                      </div>
                      <span 
                        className="history-sheet-item-title ml-1"
                        style={isActive ? { fontWeight: 600, color: `rgba(${noteColor}, 1)` } : {}}
                      >
                        {note.title || "Untitled"}
                      </span>
                    </div>
                    <div className="history-sheet-item-right">
                      <span className={`history-sheet-item-time ${isRecent ? 'recent' : ''}`}>
                        {timeStr}
                      </span>
                      <span
                        className="history-sheet-item-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (noteToDelete === note.id) {
                            onDeleteNote(note.id);
                            setNoteToDelete(null);
                          } else {
                            setNoteToDelete(note.id);
                            // Auto reset confirmation after 3s
                            setTimeout(() => {
                              setNoteToDelete((prev) => prev === note.id ? null : prev);
                            }, 3000);
                          }
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 24,
                          height: 24,
                          padding: 0,
                          backgroundColor: noteToDelete === note.id ? "hsl(var(--destructive) / 0.15)" : undefined,
                          color: noteToDelete === note.id ? "hsl(var(--destructive))" : undefined,
                          opacity: noteToDelete === note.id ? 1 : undefined,
                        }}
                      >
                        {noteToDelete === note.id ? (
                          <CheckIcon style={{ width: 14, height: 14 }} />
                        ) : (
                          <XIcon style={{ width: 14, height: 14 }} />
                        )}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </motion.div>


    </>
  );
}
