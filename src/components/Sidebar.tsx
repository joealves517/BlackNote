import { useState, useEffect } from "react";
import { Search, Plus, Moon, Sun, FileText, Loader2, LogOut, Sparkles, Globe, Info } from "lucide-react";
import { WebClipper } from "@/components/WebClipper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CHECKOUT_BASE } from "@/lib/constants";
import type { Note } from "@/hooks/use-notes";
import type { SyncProgress } from "@/lib/sync-engine";
import type { User } from "@supabase/supabase-js";



interface SidebarProps {
  notes: Note[];
  activeNoteId: string;
  searchQuery: string;
  theme: "light" | "dark";
  loading?: boolean;
  user: User | null;
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

function getUserInitial(user: User): string {
  const name =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email ||
    "U";
  return name.charAt(0).toUpperCase();
}

function getUserAvatar(user: User): string | null {
  return user.user_metadata?.avatar_url || null;
}

function getUserDisplayName(user: User): string {
  return (
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email ||
    "User"
  );
}

// Google official SVG icon
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
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
}: SidebarProps) {
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [showClipper, setShowClipper] = useState(false);
  const [showFairUseInfo, setShowFairUseInfo] = useState(false);

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
              <Moon className="h-3.5 w-3.5" style={{ color: "hsl(var(--muted-foreground))" }} />
            ) : (
              <Sun className="h-3.5 w-3.5" style={{ color: "hsl(var(--muted-foreground))" }} />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowClipper(!showClipper)}
            className="h-7 w-7"
            data-tooltip="Clip page"
          >
            <Globe className={`h-3.5 w-3.5`} style={{ color: showClipper ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCreateNote}
            className="h-7 w-7"
            data-tooltip="New note"
          >
            <Plus className="h-3.5 w-3.5" style={{ color: "hsl(var(--muted-foreground))" }} />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search
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
              <Loader2
                className="h-5 w-5 animate-spin"
                style={{ color: "hsl(var(--muted-foreground) / 0.5)" }}
              />
            </div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <FileText
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
                  <Plus className="h-3 w-3 mr-1" />
                  Create your first note
                </Button>
              )}
            </div>
          ) : (
            notes.map((note) => {
              const isActive = note.id === activeNoteId;
              return (
                <div
                  key={note.id}
                  onClick={() => onSelectNote(note.id)}
                  className="sidebar-note-item group"
                  style={{
                    backgroundColor: isActive
                      ? "hsl(var(--sidebar-active))"
                      : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        "hsl(var(--sidebar-hover))";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        "transparent";
                  }}
                >
                  <div className="sidebar-note-text">
                    <p
                      className="sidebar-note-title"
                      style={{
                        color: isActive
                          ? "hsl(var(--foreground))"
                          : "hsl(var(--sidebar-fg))",
                      }}
                    >
                      {note.title || "Untitled"}
                    </p>
                    <p className="sidebar-note-time">
                      {formatRelativeTime(note.updatedAt)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNoteToDelete(note.id);
                    }}
                    className="sidebar-note-delete"
                    data-tooltip="Delete note"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="hsl(var(--destructive))"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              );
            })
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
                      stroke="hsl(var(--foreground) / 0.1)" 
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
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p
                    className="text-xs font-semibold truncate"
                    style={{ color: "hsl(var(--foreground))" }}
                  >
                    {getUserDisplayName(user)}
                  </p>
                  {isPremium ? (
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
                          <Info className="h-[11px] w-[11px]" />
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
                <LogOut
                  className="h-3.5 w-3.5"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                />
              </Button>
            </div>

          </div>
        ) : (
          /* Not logged in — Google sign-in button */
          <button
            onClick={onSignInWithGoogle}
            className="google-signin-btn"
          >
            <GoogleIcon />
            <span>Sign in with Google</span>
          </button>
        )}
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
              <Sparkles className="h-4 w-4 text-yellow-500" />
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
