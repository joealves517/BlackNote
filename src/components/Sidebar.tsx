import { ScanLineIcon } from "@/components/icons/scan-line";
import { CircleHelpIcon } from "@/components/icons/circle-help";
import { LoaderCircleIcon } from "@/components/icons/loader-circle";
import { LogoutIcon } from "@/components/icons/logout";
import { PlusIcon } from "@/components/icons/plus";
import { MoonIcon } from "@/components/icons/moon";
import { SunIcon } from "@/components/icons/sun";
import { FileTextIcon } from "@/components/icons/file-text";
import { SparklesIcon } from "@/components/icons/sparkles";
import { SearchIcon } from "@/components/icons/search";
import { CheckIcon } from "@/components/icons/check";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import { useState, useEffect, useRef } from "react";
import { Pin, PinOff } from "lucide-react";

import { WebClipper } from "@/components/WebClipper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CHECKOUT_BASE } from "@/lib/constants";
import type { Note } from "@/hooks/use-notes";
import type { SyncProgress } from "@/lib/sync-engine";
import type { AppUser } from "@/lib/auth-client";
import Masonry from "react-masonry-css";

interface SidebarProps {
  notes: Note[];
  activeNoteId: string;
  searchQuery: string;
  theme: "light" | "dark";
  loading?: boolean;
  user: AppUser | null;
  credits: { credits: number; tier: string } | null;
  syncProgress: SyncProgress;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (id: string) => void;
  onSearchChange: (query: string) => void;
  onToggleTheme: () => void;
  onSignInWithGoogle: () => void;
  onSignOut: () => void;
  onClipSaveAsNote?: (title: string, markdown: string) => void;
  onRefreshCredits?: () => void;
  onTogglePin?: (id: string) => void;
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

function getUserInitial(user: AppUser): string {
  const name = user.displayName || user.email || "U";
  return name.charAt(0).toUpperCase();
}

function getUserAvatar(user: AppUser): string | null {
  return user.picture || null;
}

function getUserDisplayName(user: AppUser): string {
  return user.displayName || user.email || "User";
}

// Google official SVG icon
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function Sidebar({
  notes,
  activeNoteId,
  searchQuery,
  theme,
  loading,
  user,
  credits,
  syncProgress,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onSearchChange,
  onToggleTheme,
  onSignInWithGoogle,
  onSignOut,
  onRefreshCredits,
  onClipSaveAsNote,
  onTogglePin,
}: SidebarProps) {
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [showClipper, setShowClipper] = useState(false);
  const [showFairUseInfo, setShowFairUseInfo] = useState(false);
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);
  const prevSyncStatusRef = useRef(syncProgress.status);

  const getTagMeta = (tag: string) => {
    switch (tag.toLowerCase()) {
      case "work": return { color: "59, 130, 246" }; // Blue
      case "life": return { color: "168, 85, 247" }; // Purple
      case "to-do": return { color: "16, 185, 129" }; // Emerald
      case "meetings": return { color: "245, 158, 11" }; // Amber
      default: return { color: "168, 85, 247" }; // Purple
    }
  };

  useEffect(() => {
    if (prevSyncStatusRef.current === "syncing" && syncProgress.status === "idle") {
      setShowSyncSuccess(true);
      const timer = setTimeout(() => setShowSyncSuccess(false), 2000);
      return () => clearTimeout(timer);
    }
    prevSyncStatusRef.current = syncProgress.status;
  }, [syncProgress.status]);

  useEffect(() => {
    if (activeNoteId) {
      const el = document.getElementById(`note-item-${activeNoteId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [activeNoteId]);

  const isPremium = credits?.tier === "premium";
  const isQuotaExhausted = isPremium && credits?.credits !== undefined && credits.credits <= 0;

  // Listen for slash command trigger
  useEffect(() => {
    const handler = () => setShowClipper(true);
    window.addEventListener("trigger-clipper", handler);
    return () => window.removeEventListener("trigger-clipper", handler);
  }, []);

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden"
      style={{
        backgroundColor: `hsl(var(--sidebar-bg))`,
        borderRight: `1px solid hsl(var(--sidebar-border))`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2">
          <img
            src={chrome.runtime.getURL("/icon/32.png")}
            alt="BlackNote"
            className="w-5 h-5 rounded-sm object-contain"
          />
          <span
            className="text-sm font-semibold tracking-tight"
            style={{ color: "hsl(var(--foreground))" }}
          >
            BlackNote
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleTheme}
            className="h-7 w-7"
            data-tooltip={theme === "light" ? "Dark mode" : "Light mode"}
          >
            {theme === "light" ? (
              <MoonIcon size={16} className="h-4 w-4" style={{ color: "hsl(var(--muted-foreground))" }} />
            ) : (
              <SunIcon size={16} className="h-4 w-4" style={{ color: "hsl(var(--foreground))" }} />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowClipper(!showClipper)}
            className="h-7 w-7"
            data-tooltip="Clip page"
          >
            <ScanLineIcon className={`h-3.5 w-3.5`} style={{ color: showClipper ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCreateNote}
            className="h-7 w-7"
            data-tooltip="New note"
          >
            <PlusIcon className="h-3.5 w-3.5" style={{ color: "hsl(var(--muted-foreground))" }} />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <SearchIcon
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
            style={{ color: "hsl(var(--muted-foreground))" }}
          />
          <Input
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-8 text-xs"
            style={{
              backgroundColor: "hsl(var(--sidebar-hover))",
              borderColor: "transparent",
            }}
          />
        </div>
      </div>

      {/* Web Clipper */}
      {showClipper && onClipSaveAsNote && (
        <WebClipper
          onSaveAsNote={onClipSaveAsNote}
          onClose={() => setShowClipper(false)}
        />
      )}

      {/* Notes List */}
      <ScrollArea className="flex-1">
        <div className="px-1.5 pb-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderCircleIcon
                className="h-5 w-5 animate-spin"
                style={{ color: "hsl(var(--muted-foreground) / 0.5)" }}
              />
            </div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <FileTextIcon
                className="h-8 w-8 mb-2"
                style={{ color: "hsl(var(--muted-foreground) / 0.3)" }}
              />
              <p
                className="text-xs"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                {searchQuery ? "No notes found" : "No notes yet"}
              </p>
              {!searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCreateNote}
                  className="mt-2 text-xs h-7"
                >
                  <PlusIcon className="h-3 w-3 mr-1" />
                  Create your first note
                </Button>
              )}
            </div>
          ) : (
            <Masonry
              breakpointCols={2}
              className="my-masonry-grid px-2"
              columnClassName="my-masonry-grid_column"
            >
              {notes.map((note) => {
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

                return (
                  <div
                    key={note.id}
                    id={`note-item-${note.id}`}
                    onClick={() => onSelectNote(note.id)}
                    className="sidebar-note-item group relative transition-all duration-300"
                    style={{
                      background: isActive
                        ? `linear-gradient(135deg, rgba(${cardColor}, var(--icon-bg-start)) 0%, rgba(${cardColor}, var(--icon-bg-end)) 100%)`
                        : `linear-gradient(135deg, rgba(${cardColor}, calc(var(--icon-bg-start) * 0.6)) 0%, rgba(${cardColor}, calc(var(--icon-bg-end) * 0.6)) 100%)`,
                      border: isActive
                        ? `1px solid rgba(${cardColor}, var(--icon-border))`
                        : `1px solid rgba(${cardColor}, calc(var(--icon-border) * 0.5))`,
                      boxShadow: isActive
                        ? `inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 0 0 1px rgba(${cardColor}, 0.2), 0 8px 24px -4px rgba(${cardColor}, 0.2)`
                        : `inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 8px -2px rgba(0,0,0,0.05)`,
                      transform: isActive ? "scale(1.01)" : "scale(1)",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = `linear-gradient(135deg, rgba(${cardColor}, calc(var(--icon-bg-start) * 0.8)) 0%, rgba(${cardColor}, calc(var(--icon-bg-end) * 0.8)) 100%)`;
                        e.currentTarget.style.border = `1px solid rgba(${cardColor}, calc(var(--icon-border) * 0.8))`;
                        e.currentTarget.style.transform = "scale(1.005)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = `linear-gradient(135deg, rgba(${cardColor}, calc(var(--icon-bg-start) * 0.6)) 0%, rgba(${cardColor}, calc(var(--icon-bg-end) * 0.6)) 100%)`;
                        e.currentTarget.style.border = `1px solid rgba(${cardColor}, calc(var(--icon-border) * 0.5))`;
                        e.currentTarget.style.transform = "scale(1)";
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2 w-full">
                      <p
                        className="sidebar-note-title whitespace-normal break-words"
                        style={{
                          color: isActive
                            ? "hsl(var(--foreground))"
                            : "hsl(var(--sidebar-fg))",
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {note.title || "Untitled Note"}
                      </p>
                      <div
                        className="flex items-center justify-center shrink-0 w-4 h-4 cursor-pointer mt-0.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onTogglePin) onTogglePin(note.id);
                        }}
                      >
                        {note.isPinned ? (
                          <>
                            <Pin className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500 block group-hover:hidden" />
                            <PinOff className="w-3.5 h-3.5 text-red-500 hidden group-hover:block" />
                          </>
                        ) : (
                          <Pin className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between w-full mt-2 gap-1">
                      <p className="text-[10px] whitespace-nowrap flex-shrink-0 text-muted-foreground/80 font-medium">
                        {formatRelativeTime(note.updatedAt)}
                      </p>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setNoteToDelete(note.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded-md"
                        data-tooltip="Delete"
                      >
                        <DeleteIcon className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </Masonry>
          )}
        </div>
      </ScrollArea>

      {/* Bottom: User Card or Google Sign-In */}
      <div className="px-2.5 pb-2.5 pt-1 flex flex-col gap-2">
        {user ? (
          <div
            className="flex flex-col w-full rounded-xl border"
            style={{
              backgroundColor: "hsl(var(--foreground) / 0.03)",
              borderColor: "hsl(var(--border))",
            }}
          >
            {/* User Profile Card */}
            <div className="flex items-center gap-3 w-full px-3 pt-3 pb-2">
              <div className="relative flex shrink-0 items-center justify-center">
                {getUserAvatar(user) ? (
                  <img
                    src={getUserAvatar(user)!}
                    alt={getUserDisplayName(user)}
                    className="w-9 h-9 rounded-full object-cover border"
                    style={{ borderColor: "hsl(var(--border))" }}
                  />
                ) : (
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-white"
                    style={{
                      backgroundColor: "hsl(var(--primary))",
                      fontSize: "14px",
                    }}
                  >
                    {getUserInitial(user)}
                  </div>
                )}
                {syncProgress.status === "syncing" && (
                  <svg
                    className="absolute -inset-1.5 w-12 h-12 animate-spin"
                    viewBox="0 0 100 100"
                    style={{ pointerEvents: 'none' }}
                  >
                    <circle
                      cx="50" cy="50" r="46"
                      fill="none"
                      stroke="hsl(var(--foreground) / var(--icon-border))"
                      strokeWidth="6"
                    />
                    <circle
                      cx="50" cy="50" r="46"
                      fill="none"
                      stroke="hsl(var(--foreground) / 0.7)"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray="80 200"
                    />
                  </svg>
                )}
                {showSyncSuccess && (
                  <div className="absolute inset-0 flex items-center justify-center bg-green-500/80 rounded-full animate-in fade-in zoom-in duration-200">
                    <CheckIcon className="h-5 w-5 text-white" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p
                    className="text-xs font-semibold truncate"
                    style={{ color: "hsl(var(--foreground))" }}
                  >
                    {getUserDisplayName(user)}
                  </p>
                  {credits === null ? (
                    <div className="w-12 h-3.5 rounded-sm animate-pulse shrink-0" style={{ backgroundColor: "hsl(var(--muted))" }} />
                  ) : isPremium ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-sm"
                        style={{ color: "hsl(var(--muted-foreground))", backgroundColor: "hsl(var(--muted) / 0.5)" }}
                      >
                        PRO
                      </span>
                      {isQuotaExhausted && (
                        <button
                          className="sidebar-info-btn"
                          onClick={() => setShowFairUseInfo(true)}
                          data-tooltip="Usage info"
                        >
                          <CircleHelpIcon className="h-[11px] w-[11px]" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        const url = `${CHECKOUT_BASE}?checkout[email]=${encodeURIComponent(user.email || "")}&checkout[custom][user_id]=${user.id}`;
                        chrome.tabs.create({ url });
                      }}
                      className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-sm shrink-0 transition-opacity hover:opacity-80 active:scale-95"
                      style={{ color: "hsl(45 90% 55%)", backgroundColor: "hsl(45 90% 55% / 0.15)" }}
                    >
                      UPGRADE
                    </button>
                  )}
                </div>
                <p
                  className="text-[10px] truncate mt-0.5"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  {user.email}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onSignOut}
                className="h-8 w-8 shrink-0"
                data-tooltip="Sign out"
              >
                <LogoutIcon
                  className="h-3.5 w-3.5"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                />
              </Button>
            </div>

          </div>
        ) : null}
      </div>
      {/* Fair Use Info Modal */}
      {showFairUseInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowFairUseInfo(false)}>
          <div
            className="bg-background border rounded-[20px] p-5 shadow-lg max-w-[320px] w-full text-center flex flex-col gap-3"
            style={{ backgroundColor: "hsl(var(--background))", borderColor: "hsl(var(--border))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center gap-2">
              <SparklesIcon className="h-4 w-4 text-yellow-500" />
              <h3 className="text-[15px] font-semibold" style={{ color: "hsl(var(--foreground))" }}>Fair Use Policy</h3>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
              You've reached your premium AI usage limit for this billing cycle.
              You're now using standard AI until your next renewal.
            </p>
            <p className="text-[10px]" style={{ color: "hsl(var(--muted-foreground) / 0.6)" }}>
              Your Pro status remains active.
            </p>
            <Button
              variant="outline"
              className="h-9 rounded-full text-xs font-medium w-full"
              onClick={() => setShowFairUseInfo(false)}
            >
              Got it
            </Button>
          </div>
        </div>
      )}
      {/* Delete Note Confirmation Modal */}
      {noteToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-background border rounded-[20px] p-5 shadow-lg max-w-[320px] w-full text-center flex flex-col gap-4" style={{ backgroundColor: "hsl(var(--background))", borderColor: "hsl(var(--border))" }}>
            <h3 className="text-[15px] font-semibold text-foreground">Delete Note</h3>
            <p className="text-xs text-muted-foreground">
              Are you sure you want to delete this note? This action cannot be undone.
            </p>
            <div className="flex gap-2 w-full mt-2">
              <Button
                variant="outline"
                className="flex-1 h-9 rounded-full text-xs font-medium"
                onClick={() => setNoteToDelete(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1 h-9 rounded-full text-xs font-medium"
                onClick={() => {
                  onDeleteNote(noteToDelete);
                  setNoteToDelete(null);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
