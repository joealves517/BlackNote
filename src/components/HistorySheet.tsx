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
import { PinOff, Trash2Icon, Mic, Video } from "lucide-react";
import { ArrowDownUpIcon } from "@/components/icons/arrow-down-up";
import { PinIcon } from "@/components/animate-ui/icons/pin";
import Masonry from "react-masonry-css";

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
  const [sortMode, setSortMode] = useState<"updated" | "created" | "title">("updated");
  const [tagFilter, setTagFilter] = useState<string>("All");
  const DEFAULT_TAGS = ["All", "Work", "Life", "To-do", "Meetings"];
  
  const getTagMeta = (tag: string) => {
    switch (tag.toLowerCase()) {
      case "work": return { color: "59, 130, 246" }; // Blue
      case "life": return { color: "168, 85, 247" }; // Purple
      case "to-do": return { color: "16, 185, 129" }; // Emerald
      case "meetings": return { color: "245, 158, 11" }; // Amber
      default: return { color: "168, 85, 247" }; // Purple
    }
  };

  const searchRef = useRef<HTMLInputElement>(null);

  // Auto-focus search on open and scroll to active note
  useEffect(() => {
    // Scroll instantly before the sheet slide-up animation finishes to remember position
    if (activeNoteId) {
      requestAnimationFrame(() => {
        const el = document.getElementById(`history-item-${activeNoteId}`);
        const container = document.querySelector(".history-sheet-content") as HTMLElement;
        if (el && container) {
          // Manually scroll the container to avoid scrolling the main document/editor
          const containerHalfHeight = container.clientHeight / 2;
          const elHalfHeight = el.clientHeight / 2;
          
          // Using offsetTop assumes container is the closest positioned ancestor, 
          // or we can use getBoundingClientRect math for absolute safety:
          const elRect = el.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const offsetTop = elRect.top - containerRect.top + container.scrollTop;
          
          container.scrollTop = offsetTop - containerHalfHeight + elHalfHeight;
        }
      });
    }

    // Delay focus until animation completes to avoid keyboard popping up aggressively
    setTimeout(() => {
      searchRef.current?.focus({ preventScroll: true });
    }, 400);
  }, [activeNoteId]);

  const filteredNotes = (searchQuery
    ? notes.filter((n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : notes)
    .filter((n) => tagFilter === "All" || (n.tags && n.tags.includes(tagFilter)))
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      if (sortMode === "updated") return b.updatedAt.getTime() - a.updatedAt.getTime();
      if (sortMode === "created") return b.createdAt.getTime() - a.createdAt.getTime();
      if (sortMode === "title") return a.title.localeCompare(b.title);
      return 0;
    });

  const renderNote = (note: Note) => {
    const isActive = note.id === activeNoteId;

    // Derive card color from the note's first hashtag, fallback to deterministic random
    const defaultColors = [
      "59, 130, 246", // Blue
      "168, 85, 247", // Purple
      "245, 158, 11", // Amber
      "16, 185, 129", // Green
    ];
    const colorIdx = note.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % defaultColors.length;
    const tagColor = note.tags && note.tags.length > 0 ? getTagMeta(note.tags[0]).color : null;
    const cardColor = tagColor || defaultColors[colorIdx];

    // Extract brief snippet from ProseMirror content
    let snippet = "";
    let firstImageSrc = "";
    let audioCount = 0;
    let videoCount = 0;

    if (note.content) {
      try {
        const doc = JSON.parse(note.content);
        const traverse = (node: any) => {
          if (!firstImageSrc && node.type === "image" && node.attrs?.src) {
            firstImageSrc = node.attrs.src;
          }
          if (node.type === "audioNode") audioCount++;
          if (node.type === "videoNode") videoCount++;

          if (snippet.length > 400) return; // Allow longer text previews
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
    snippet = snippet.trim();

    // Max lines for natural organic staggering (Google Keep allows around 8-10 lines)
    const maxLines = 6;

    return (
      <button
        key={note.id}
        id={`history-item-${note.id}`}
        onClick={() => {
          onSelectNote(note.id);
          onClose();
        }}
        className="history-sheet-item group relative"
        style={{
          background: tagColor || isActive 
            ? `linear-gradient(135deg, rgba(${cardColor}, var(--icon-bg-start)) 0%, rgba(${cardColor}, var(--icon-bg-end)) 100%)`
            : "hsl(var(--sidebar-hover) / 0.5)",
          border: tagColor || isActive 
            ? `1px solid rgba(${cardColor}, var(--icon-border))` 
            : "1px solid hsl(var(--border) / 0.5)",
          boxShadow: tagColor || isActive 
            ? `inset 0 1px 0 rgba(255, 255, 255, 0.5)` 
            : "none",
        }}
      >
        {firstImageSrc && (
          <div className="w-full mb-3 rounded-md overflow-hidden bg-black/5 dark:bg-white/5 border border-border/10">
            <img 
              src={firstImageSrc} 
              alt="Note cover" 
              className="w-full h-auto" 
              style={{ display: 'block' }}
            />
          </div>
        )}
        <div className="flex items-start justify-between gap-2 w-full">
          <span
            className="history-sheet-item-title whitespace-normal break-words font-semibold text-sm"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              color: isActive ? "hsl(var(--foreground))" : "hsl(var(--sidebar-fg))"
            }}
          >
            {highlightText(note.title || "Untitled", searchQuery)}
          </span>
          <div
            className="flex items-center justify-center shrink-0 w-4 h-4 cursor-pointer mt-0.5"
            onClick={(e) => {
              e.stopPropagation();
              if (onTogglePin) onTogglePin(note.id);
            }}
          >
            {note.isPinned ? (
              <>
                <PinIcon
                  size={16}
                  className="w-3.5 h-3.5 text-yellow-500 block group-hover:hidden"
                  style={{ fill: "currentColor" }}
                />
                <PinOff
                  className="w-3 h-3 text-red-500 hidden group-hover:block"
                />
              </>
            ) : (
              <PinIcon
                size={16}
                className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              />
            )}
          </div>
        </div>

        {snippet && (
          <p
            className="text-[13px] mt-1.5 text-left opacity-80 whitespace-normal break-words w-full leading-[1.5]"
            style={{
              color: isActive ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
              display: "-webkit-box",
              WebkitLineClamp: maxLines,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {highlightText(snippet, searchQuery)}
          </p>
        )}

        {(audioCount > 0 || videoCount > 0) && (
          <div className="flex items-center gap-2 mt-2.5 w-full flex-wrap">
            {audioCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] bg-blue-500/15 text-blue-500 border border-blue-500/20 px-1.5 py-0.5 rounded-md font-medium shrink-0">
                <Mic className="w-3 h-3" /> {audioCount} Audio
              </span>
            )}
            {videoCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] bg-purple-500/15 text-purple-500 border border-purple-500/20 px-1.5 py-0.5 rounded-md font-medium shrink-0">
                <Video className="w-3 h-3" /> {videoCount} Screen
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between w-full mt-2 gap-1">
          <span className="text-[9px] whitespace-nowrap flex-shrink-0 text-muted-foreground/40 bg-background/50 px-1.5 py-0.5 rounded-md">
            {formatRelativeTime(note.updatedAt)}
          </span>
          <button
            className={`opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center w-[22px] h-[22px] rounded-md cursor-pointer ${
              noteToDelete === note.id 
                ? 'bg-destructive/15 text-destructive opacity-100' 
                : 'hover:bg-destructive/10 text-muted-foreground hover:text-destructive'
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
              <CheckIcon className="w-3 h-3" style={{ width: 12, height: 12 }} />
            ) : (
              <Trash2Icon className="w-3 h-3" />
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
          {/* Tag Filter Row */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none px-2">
            {DEFAULT_TAGS.map((tag) => {
              const isActive = tagFilter === tag;
              const isAll = tag === "All";
              const color = !isAll ? getTagMeta(tag).color : null;
              
              return (
                <button
                  key={tag}
                  onClick={() => setTagFilter(tag)}
                  className="flex-shrink-0 px-3 py-1 text-xs rounded-full transition-all"
                  style={{
                    background: isAll 
                      ? (isActive ? "hsl(var(--primary))" : "transparent")
                      : (isActive 
                          ? `linear-gradient(135deg, rgba(${color}, var(--icon-bg-start)) 0%, rgba(${color}, var(--icon-bg-end)) 100%)` 
                          : `rgba(${color}, 0.05)`),
                    border: isAll 
                      ? (isActive ? "1px solid hsl(var(--primary))" : "1px solid hsl(var(--border) / 0.5)")
                      : (isActive 
                          ? `1px solid rgba(${color}, var(--icon-border))` 
                          : `1px solid rgba(${color}, 0.15)`),
                    color: isAll 
                      ? (isActive ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))")
                      : `rgba(${color}, 1)`,
                    boxShadow: isActive && !isAll 
                      ? `inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 2px 10px -2px rgba(${color}, 0.2)` 
                      : "none",
                    fontWeight: isActive ? 600 : 500,
                  }}
                >
                  {isAll ? tag : `#${tag}`}
                </button>
              );
            })}
          </div>

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
              <Masonry
                breakpointCols={2}
                className="my-masonry-grid"
                columnClassName="my-masonry-grid_column"
              >
                {filteredNotes.map(renderNote)}
              </Masonry>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}
