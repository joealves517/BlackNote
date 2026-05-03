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

interface HistorySheetProps {
  notes: Note[];
  activeNoteId: string;
  loading?: boolean;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (id: string) => void;
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

export function HistorySheet({
  notes,
  activeNoteId,
  loading,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onClose,
}: HistorySheetProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Auto-focus search on open
  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 100);
  }, []);

  const filteredNotes = searchQuery
    ? notes.filter((n) =>
        n.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : notes;

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
                return (
                  <button
                    key={note.id}
                    onClick={() => {
                      onSelectNote(note.id);
                      onClose();
                    }}
                    className="history-sheet-item"
                    style={{
                      backgroundColor: isActive
                        ? "hsl(var(--sidebar-active))"
                        : undefined,
                    }}
                  >
                    <div className="history-sheet-item-left">
                      <FileTextIcon
                        className="w-4 h-4 shrink-0"
                        style={{ color: "hsl(var(--foreground))" }}
                      />
                      <span className="history-sheet-item-title">
                        {note.title || "Untitled"}
                      </span>
                    </div>
                    <div className="history-sheet-item-right">
                      <span className="history-sheet-item-time">
                        {formatRelativeTime(note.updatedAt)}
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
