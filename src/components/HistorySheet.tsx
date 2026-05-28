import { LoaderCircleIcon } from "@/components/icons/loader-circle";
import { FileTextIcon } from "@/components/icons/file-text";
import { SearchIcon } from "@/components/icons/search";
import { CheckIcon } from "@/components/icons/check";
import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";

import type { Note } from "@/hooks/use-notes";
import { Trash2Icon, Star } from "lucide-react";

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

function highlightText(text: string, highlight: string) {
  if (!highlight.trim() || !text) return text;
  
  const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedHighlight})`, 'gi');
  const parts = text.split(regex);
  
  return parts.map((part, i) => 
    regex.test(part) ? (
      <mark key={i} style={{ backgroundColor: 'hsl(var(--primary) / 0.3)', color: 'inherit', borderRadius: '3px', padding: '0 2px' }}>
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
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
  const searchRef = useRef<HTMLInputElement>(null);

  // Auto-focus search on open and scroll to active note
  useEffect(() => {
    if (activeNoteId) {
      requestAnimationFrame(() => {
        const el = document.getElementById(`history-item-${activeNoteId}`);
        const container = document.querySelector(".history-sheet-content") as HTMLElement;
        if (el && container) {
          const elRect = el.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const offsetTop = elRect.top - containerRect.top + container.scrollTop;
          
          const containerHalfHeight = container.clientHeight / 2;
          const elHalfHeight = el.clientHeight / 2;
          
          container.scrollTop = offsetTop - containerHalfHeight + elHalfHeight;
        }
      });
    }

    setTimeout(() => {
      searchRef.current?.focus({ preventScroll: true });
    }, 400);
  }, [activeNoteId]);

  // Helper to extract media previews and snippets
  const getNotePreviewDetails = (note: Note) => {
    let snippet = "";
    let firstImageSrc = "";

    if (note.content) {
      try {
        const doc = JSON.parse(note.content);
        const traverse = (node: any) => {
          if (!firstImageSrc && node.type === "image" && node.attrs?.src) {
            firstImageSrc = node.attrs.src;
          }
          if (snippet.length > 300) return;
          if (node.type === "text" && node.text) {
            snippet += node.text + " ";
          }
          if (node.content && Array.isArray(node.content)) {
            node.content.forEach(traverse);
          }
        };
        traverse(doc);
      } catch (e) {
        // Ignore parse errors
      }
    }
    return {
      snippet: snippet.trim(),
      firstImageSrc,
    };
  };

  const filteredNotes = (searchQuery
    ? notes.filter((n) => {
        const titleMatch = n.title.toLowerCase().includes(searchQuery.toLowerCase());
        const { snippet } = getNotePreviewDetails(n);
        const snippetMatch = snippet.toLowerCase().includes(searchQuery.toLowerCase());
        const tagsMatch = n.tags && n.tags.some(tag => 
          tag.toLowerCase().includes(searchQuery.toLowerCase().replace("#", ""))
        );
        return titleMatch || snippetMatch || tagsMatch;
      })
    : notes)
    .sort((a, b) => {
      // Starred/Pinned notes go to the top
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      // Sort other notes by updatedAt descending
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

  // Render a list row (Gmail & Apple Notes hybrid style)
  const renderListNote = (note: Note) => {
    const isActive = note.id === activeNoteId;
    const { snippet } = getNotePreviewDetails(note);

    return (
      <button
        key={note.id}
        id={`history-item-${note.id}`}
        onClick={() => {
          onSelectNote(note.id);
          onClose();
        }}
        className={`w-full group flex items-start gap-3 py-3 px-3 text-left transition-all duration-150 relative border-none cursor-pointer ${
          isActive 
            ? "bg-zinc-200/60 dark:bg-zinc-800/40 text-foreground font-semibold rounded-xl" 
            : "bg-transparent text-foreground hover:bg-zinc-200/25 dark:hover:bg-zinc-800/20 rounded-xl"
        }`}
      >
        {/* Center: Title & 2-line snippet */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          {/* Row 1: Title (with optional tag badge next to it) & Time */}
          <div className="flex items-baseline justify-between w-full gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {note.title ? (
                <span className="text-sm font-semibold truncate text-foreground group-hover:text-primary transition-colors">
                  {highlightText(note.title, searchQuery)}
                </span>
              ) : (
                <span className="text-sm font-normal italic text-muted-foreground/60 dark:text-muted-foreground/45">
                  Untitled Note
                </span>
              )}
              {note.tags && note.tags.length > 0 && (
                <span 
                  className="inline-flex items-center text-sm font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-200/50 dark:bg-zinc-800/60 px-2 py-0.5 rounded leading-none shrink-0"
                >
                  #{note.tags[0]}
                </span>
              )}
            </div>
            
            <span className="text-[10px] font-medium text-muted-foreground/65 dark:text-muted-foreground/45 shrink-0">
              {formatRelativeTime(note.updatedAt)}
            </span>
          </div>
          
          {/* Row 2 & 3: Snippet (Clamped to 2 lines) */}
          <p 
            className="text-[12px] text-muted-foreground/80 dark:text-muted-foreground/60 leading-[1.4] whitespace-normal break-words mt-0.5"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {highlightText(snippet || "No additional text", searchQuery)}
          </p>
        </div>

        {/* Right Side Actions: Gmail Star & Quick Delete */}
        <div className="flex flex-col items-center justify-between self-stretch shrink-0 gap-1.5 ml-1">
          {/* Gmail-style Star Button (Always visible) */}
          <button
            className={`flex items-center justify-center w-6 h-6 rounded-md cursor-pointer transition-all duration-200 hover:scale-110 ${
              note.isPinned 
                ? "text-yellow-500" 
                : "text-muted-foreground/65 dark:text-zinc-500 hover:text-yellow-500"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              if (onTogglePin) onTogglePin(note.id);
            }}
            title={note.isPinned ? "Unstar note" : "Star note"}
          >
            {note.isPinned ? (
              <Star className="w-[16px] h-[16px] fill-current" />
            ) : (
              <Star className="w-[16px] h-[16px]" />
            )}
          </button>

          {/* Delete Button (Only visible on hover of the row container) */}
          <button
            className={`flex items-center justify-center w-6 h-6 rounded-md cursor-pointer transition-all duration-150 opacity-0 group-hover:opacity-100 ${
              noteToDelete === note.id 
                ? "bg-destructive/15 text-destructive opacity-100" 
                : "text-muted-foreground/60 dark:text-zinc-400 hover:text-destructive hover:bg-destructive/10"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              if (noteToDelete === note.id) {
                onDeleteNote(note.id);
                setNoteToDelete(null);
              } else {
                setNoteToDelete(note.id);
                setTimeout(() => {
                  setNoteToDelete((prev) => prev === note.id ? null : prev);
                }, 3000);
              }
            }}
            title={noteToDelete === note.id ? "Confirm delete" : "Delete note"}
          >
            {noteToDelete === note.id ? (
              <CheckIcon className="w-3.5 h-3.5" />
            ) : (
              <Trash2Icon className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </button>
    );
  };

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
              /* Flat List View with Crisper Inset Separators (Apple style, no headers or backgrounds) */
              <div className="flex flex-col gap-0.5 px-4 pb-4">
                {filteredNotes.map((note, index) => (
                  <div key={note.id} className="w-full flex flex-col items-center">
                    {renderListNote(note)}
                    {index < filteredNotes.length - 1 && (
                      <div className="h-[1px] w-[calc(100%-1.5rem)] ml-3 mr-3 bg-zinc-300/80 dark:bg-zinc-800/80 self-start my-0.5" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}
