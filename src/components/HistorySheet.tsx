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
import { PinOff, Trash2Icon, Mic, Video, LayoutGrid, List } from "lucide-react";
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
  const [layoutMode, setLayoutMode] = useState<"grid" | "list">(() => {
    return (localStorage.getItem("blacknote_history_layout") as "grid" | "list") || "grid";
  });

  const handleToggleLayout = () => {
    const next = layoutMode === "grid" ? "list" : "grid";
    setLayoutMode(next);
    localStorage.setItem("blacknote_history_layout", next);
  };

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

  // Helper to extract media previews and snippets
  const getNotePreviewDetails = (note: Note) => {
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

          if (snippet.length > 400) return;
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
      audioCount,
      videoCount,
    };
  };

  // Helper to group notes by date categories (Apple Notes style)
  const groupNotesByDate = (notesToGroup: Note[]) => {
    const groups: { [key: string]: Note[] } = {};
    const groupOrder: string[] = [];
    const now = new Date();
    
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    notesToGroup.forEach((note) => {
      const date = note.updatedAt;
      const noteDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      
      let groupName = "";
      if (noteDay.getTime() === today.getTime()) {
        groupName = "Today";
      } else if (noteDay.getTime() === yesterday.getTime()) {
        groupName = "Yesterday";
      } else if (noteDay >= sevenDaysAgo) {
        groupName = "Previous 7 Days";
      } else if (date.getFullYear() === now.getFullYear()) {
        groupName = date.toLocaleDateString("en-US", { month: "long" });
      } else {
        groupName = date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      }
      
      if (!groups[groupName]) {
        groups[groupName] = [];
        groupOrder.push(groupName);
      }
      groups[groupName].push(note);
    });
    
    return groupOrder.map((title) => ({
      title,
      notes: groups[title],
    }));
  };

  // Render a grid note card (original Grid View)
  const renderNote = (note: Note) => {
    const isActive = note.id === activeNoteId;
    const { snippet, firstImageSrc, audioCount, videoCount } = getNotePreviewDetails(note);

    const defaultColors = [
      "59, 130, 246", // Blue
      "168, 85, 247", // Purple
      "245, 158, 11", // Amber
      "16, 185, 129", // Green
    ];
    const colorIdx = note.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % defaultColors.length;
    const tagColor = note.tags && note.tags.length > 0 ? getTagMeta(note.tags[0]).color : null;
    const cardColor = tagColor || defaultColors[colorIdx];

    const maxLines = 6;
    const isColored = tagColor !== null;
    const neutralColor = "120, 120, 128";
    const displayColor = isColored || isActive ? cardColor : neutralColor;

    return (
      <button
        key={note.id}
        id={`history-item-${note.id}`}
        onClick={() => {
          onSelectNote(note.id);
          onClose();
        }}
        className="history-sheet-item group relative transition-all duration-200"
        style={{
          background: `linear-gradient(135deg, rgba(${displayColor}, var(--icon-bg-start)) 0%, rgba(${displayColor}, var(--icon-bg-end)) 100%)`,
          border: `1px solid rgba(${displayColor}, var(--icon-border))`,
          boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.4)`,
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
            className="history-sheet-item-title whitespace-normal break-words font-semibold text-sm text-left"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              color: isActive ? "hsl(var(--foreground))" : "hsl(var(--sidebar-fg))"
            }}
          >
            {note.title ? (
              highlightText(note.title, searchQuery)
            ) : (
              <span className="text-muted-foreground/40 font-normal italic">Untitled Note</span>
            )}
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
          <span className="text-[9px] whitespace-nowrap flex-shrink-0 text-muted-foreground/80 font-medium">
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

  // Render a list row (Apple Notes style)
  const renderListNote = (note: Note) => {
    const isActive = note.id === activeNoteId;
    const { snippet, firstImageSrc } = getNotePreviewDetails(note);

    return (
      <button
        key={note.id}
        id={`history-item-${note.id}`}
        onClick={() => {
          onSelectNote(note.id);
          onClose();
        }}
        className={`w-full group flex items-center justify-between p-3.5 text-left transition-all duration-150 relative border-none cursor-pointer ${
          isActive 
            ? "bg-zinc-200/60 dark:bg-zinc-800/40 text-foreground font-semibold" 
            : "bg-transparent text-foreground hover:bg-zinc-200/30 dark:hover:bg-zinc-800/20"
        }`}
      >
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          {/* Note Title */}
          {note.title ? (
            <span className="text-sm font-semibold truncate text-foreground group-hover:text-primary transition-colors">
              {highlightText(note.title, searchQuery)}
            </span>
          ) : (
            <span className="text-sm font-normal italic text-muted-foreground/60 dark:text-muted-foreground/40">
              Untitled Note
            </span>
          )}
          
          {/* Note Date + Snippet */}
          <div className="flex items-center gap-1.5 text-xs text-left min-w-0">
            <span className="text-[11px] font-medium text-muted-foreground/75 dark:text-muted-foreground/50 shrink-0">
              {note.updatedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" })}
            </span>
            <span className="text-muted-foreground/40 dark:text-muted-foreground/20 shrink-0">•</span>
            <span className="text-[11px] text-muted-foreground/70 dark:text-muted-foreground/45 truncate flex-1">
              {snippet || "No additional text"}
            </span>
          </div>
        </div>

        {/* Thumbnail Preview on Right (if note has an image) */}
        {firstImageSrc && (
          <div className="w-8 h-8 rounded-md overflow-hidden bg-black/10 border border-border/10 shrink-0 ml-2">
            <img src={firstImageSrc} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        {/* Hover Actions: Pin & Delete */}
        <div className="flex items-center gap-1 ml-2 shrink-0">
          <button
            className={`flex items-center justify-center w-6 h-6 rounded-md cursor-pointer transition-all ${
              note.isPinned 
                ? "text-yellow-500 bg-yellow-500/10 opacity-100" 
                : "text-muted-foreground/40 hover:text-foreground hover:bg-zinc-200 dark:hover:bg-zinc-800 opacity-0 group-hover:opacity-100"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              if (onTogglePin) onTogglePin(note.id);
            }}
            title={note.isPinned ? "Unpin note" : "Pin note"}
          >
            {note.isPinned ? (
              <PinIcon size={13} className="w-3.5 h-3.5" style={{ fill: "currentColor" }} />
            ) : (
              <PinIcon size={13} className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            className={`flex items-center justify-center w-6 h-6 rounded-md cursor-pointer transition-all opacity-0 group-hover:opacity-100 ${
              noteToDelete === note.id 
                ? "bg-destructive/15 text-destructive opacity-100 animate-pulse" 
                : "hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive"
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
              <CheckIcon className="w-3 h-3" />
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
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none px-4">
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
          <div className="history-sheet-section-label flex items-center justify-between">
            <span>Notes ({filteredNotes.length})</span>
            <div className="flex items-center gap-3">
              {/* Layout Switcher */}
              <button
                onClick={handleToggleLayout}
                className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors bg-transparent border-none cursor-pointer p-0"
              >
                {layoutMode === "grid" ? (
                  <>
                    <List size={14} className="w-3.5 h-3.5" />
                    <span className="w-6 text-left">List</span>
                  </>
                ) : (
                  <>
                    <LayoutGrid size={14} className="w-3.5 h-3.5" />
                    <span className="w-6 text-left">Grid</span>
                  </>
                )}
              </button>

              <div className="h-3 w-px bg-zinc-800" />

              {/* Sort order */}
              <button
                onClick={() => {
                  const modes: ("updated" | "created" | "title")[] = ["updated", "created", "title"];
                  const nextIndex = (modes.indexOf(sortMode) + 1) % modes.length;
                  setSortMode(modes[nextIndex]);
                }}
                className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors bg-transparent border-none cursor-pointer p-0"
              >
                <ArrowDownUpIcon size={14} className="w-3.5 h-3.5" />
                <span className="w-[52px] text-left">
                  {sortMode === "updated" ? "Updated" : sortMode === "created" ? "Created" : "Title"}
                </span>
              </button>
            </div>
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
            ) : layoutMode === "grid" ? (
              <div className="px-4 pb-4">
                <Masonry
                  breakpointCols={2}
                  className="my-masonry-grid"
                  columnClassName="my-masonry-grid_column"
                >
                  {filteredNotes.map(renderNote)}
                </Masonry>
              </div>
            ) : (
              /* Grouped List View with Background but No Border */
              <div className="flex flex-col gap-5 px-4 pb-4">
                {groupNotesByDate(filteredNotes).map((group) => {
                  const isAll = tagFilter === "All";
                  const tagColor = !isAll ? getTagMeta(tagFilter).color : null;
                  const groupCardStyle = !isAll ? {
                    '--tag-bg-light': `rgba(${tagColor}, 0.08)`,
                    '--tag-bg-dark': `rgba(${tagColor}, 0.045)`,
                  } as React.CSSProperties : {};

                  return (
                    <div key={group.title} className="flex flex-col gap-2 text-left">
                      {/* Group Title */}
                      <h3 className="text-[10px] font-bold text-muted-foreground/80 dark:text-muted-foreground/60 pl-2.5 tracking-wider uppercase">
                        {group.title}
                      </h3>
                      
                      {/* Group Card Container (With soft bg, rounded-2xl, no border) */}
                      <div 
                        className={`flex flex-col rounded-2xl overflow-hidden ${
                          isAll 
                            ? "bg-zinc-100/90 dark:bg-zinc-900/45" 
                            : "bg-[var(--tag-bg-light)] dark:bg-[var(--tag-bg-dark)]"
                        }`}
                        style={groupCardStyle}
                      >
                        {group.notes.map((note, index) => (
                          <div key={note.id} className="w-full flex flex-col items-center">
                            {renderListNote(note)}
                            {index < group.notes.length - 1 && (
                              <div 
                                className="w-full h-px shrink-0 bg-gradient-to-r from-transparent via-zinc-300/85 dark:via-zinc-800/60 to-transparent" 
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}
