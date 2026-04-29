import { EarthIcon } from "@/components/icons/earth";
import { CircleHelpIcon } from "@/components/icons/circle-help";
import { PlusIcon } from "@/components/icons/plus";
import { HistoryIcon } from "@/components/icons/history";
import { MoonIcon } from "@/components/icons/moon";
import { SunIcon } from "@/components/icons/sun";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback, useEffect, useRef } from "react";
import { NoteEditor } from "@/components/NoteEditor";
import { AIErrorSheet } from "@/components/AIErrorSheet";
import { HistorySheet } from "@/components/HistorySheet";
import { AccountPopup } from "@/components/AccountPopup";
import { WebClipper } from "@/components/WebClipper";
import { LoaderIcon } from "@/components/ui/loader";
import { GripIcon } from "@/components/icons/grip";
import { GlobalTooltip } from "@/components/Tooltip";
import { useNotes } from "@/hooks/use-notes";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useCredits } from "@/hooks/use-credits";
import { ArrowBigUpDashIcon } from "@/components/icons/arrow-big-up-dash";
import { ChessKingIcon } from "@/components/icons/chess-king";
import { HandMetalIcon } from "@/components/icons/hand-metal";
import { HeartHandshakeIcon } from "@/components/icons/heart-handshake";

import { CHECKOUT_BASE } from "@/lib/constants";

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l3.68-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.68 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function getUserAvatar(user: any): string | null {
  return user?.user_metadata?.avatar_url || null;
}

export function App() {
  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuth();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      await signInWithGoogle();
    } finally {
      setIsLoggingIn(false);
    }
  };

  const {
    notes,
    activeNote,
    activeNoteId,
    searchQuery,
    loading: notesLoading,
    syncProgress,
    setActiveNoteId,
    setSearchQuery,
    createNote,
    updateNote,
    deleteNote,
    createNoteWithContent,
  } = useNotes(user?.id);

  const { theme, toggleTheme } = useTheme();
  const { credits, refreshCredits } = useCredits(user?.id);

  const [showHistory, setShowHistory] = useState(false);
  const [showClipper, setShowClipper] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [proIconIndex, setProIconIndex] = useState(() => Math.floor(Math.random() * 3));
  const headerProIconRef = useRef<any>(null);

  // Re-randomize Pro icon when extension is reopened (visibility changes)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setProIconIndex(Math.floor(Math.random() * 3));
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);
  const [aiErrorVisible, setAiErrorVisible] = useState(false);
  const scrollProgressRef = useRef(0);
  const headerRef = useRef<HTMLDivElement>(null);

  const handleScrollProgress = useCallback((progress: number) => {
    scrollProgressRef.current = progress;
    const el = headerRef.current;
    if (!el) return;

    const t = progress; // 0 → 1

    // Measure actual content width to know where to stop shrinking
    const parentWidth = el.parentElement?.clientWidth || 400;
    let contentWidth = 0;
    for (let i = 0; i < el.children.length; i++) {
      contentWidth += (el.children[i] as HTMLElement).offsetWidth;
    }
    contentWidth += 12; // padding buffer
    const maxSide = Math.max(0, (parentWidth - contentWidth) / 2);

    const topPx = t * 6;
    const sidePx = t * maxSide;
    const height = 44 - t * 8;
    const paddingX = 8 - t * 4;
    const radius = t * 20;
    const bgAlpha = t * 0.8;
    const blur = t * 16;
    const shadow = t * 0.15;
    const borderAlpha = t * 0.4;

    el.style.top = `${topPx}px`;
    el.style.left = `${sidePx}px`;
    el.style.right = `${sidePx}px`;
    el.style.height = `${height}px`;
    el.style.paddingLeft = `${paddingX}px`;
    el.style.paddingRight = `${paddingX}px`;
    el.style.borderRadius = `${radius}px`;
    el.style.backgroundColor = `hsl(var(--background) / ${bgAlpha})`;
    el.style.backdropFilter = blur > 0 ? `blur(${blur}px)` : 'none';
    const isDark = document.documentElement.classList.contains("dark");
    if (shadow > 0) {
      if (isDark) {
        el.style.boxShadow = `inset 0 0 0 1px rgba(255, 255, 255, ${t * 0.05}), 0 4px 16px rgba(0,0,0,${shadow * 1.5})`;
      } else {
        el.style.boxShadow = `0 2px 12px rgba(0,0,0,${shadow})`;
      }
    } else {
      el.style.boxShadow = 'none';
    }
    el.style.borderColor = 'transparent';
  }, []);

  // Recalculate island width if internal content resizes (e.g., hover expansions)
  useEffect(() => {
    const el = headerRef.current;
    if (!el || !el.children[0]) return;
    
    let rafId: number;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        handleScrollProgress(scrollProgressRef.current || 0);
      });
    });
    
    observer.observe(el.children[0]);
    if (el.children[1]) observer.observe(el.children[1]);
    
    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [handleScrollProgress]);

  const isPremium = credits?.tier === "premium";
  const isQuotaExhausted =
    isPremium && credits?.credits !== undefined && credits.credits <= 0;

  // Listen for AI error events from the editor
  useEffect(() => {
    const handler = () => setAiErrorVisible(true);
    window.addEventListener("ai-error", handler);
    window.addEventListener("ai-error-refunded", handler);
    return () => {
      window.removeEventListener("ai-error", handler);
      window.removeEventListener("ai-error-refunded", handler);
    };
  }, []);

  // Listen for slash command "/clip" → open clipper
  useEffect(() => {
    const handleOpenClipper = () => setShowClipper(true);
    window.addEventListener("open-web-clipper", handleOpenClipper);
    return () => window.removeEventListener("open-web-clipper", handleOpenClipper);
  }, []);

  // Also listen for "trigger-clipper" (legacy event from sidebar)
  useEffect(() => {
    const handler = () => setShowClipper(true);
    window.addEventListener("trigger-clipper", handler);
    return () => window.removeEventListener("trigger-clipper", handler);
  }, []);

  // Clean up empty notes when switching away
  const cleanupEmptyNotes = useCallback(() => {
    notes.forEach((note) => {
      const hasTitle = note.title.trim() !== "" && note.title !== "Untitled";
      let hasContent = false;
      try {
        const parsed = JSON.parse(note.content);
        if (parsed?.type === "doc" && Array.isArray(parsed.content)) {
          hasContent = parsed.content.some((node: any) => {
            if (node.type === "paragraph" && Array.isArray(node.content)) {
              return node.content.some(
                (c: any) => c.text && c.text.trim() !== ""
              );
            }
            return node.type !== "paragraph";
          });
        }
      } catch {
        hasContent = false;
      }

      if (!hasTitle && !hasContent && note.id !== activeNoteId) {
        deleteNote(note.id);
      }
    });
  }, [notes, activeNoteId, deleteNote]);

  const handleContentChange = (noteId: string, content: string) => {
    updateNote(noteId, { content });
  };

  const handleTitleChange = (noteId: string, title: string) => {
    updateNote(noteId, { title });
  };

  const handleCreateNote = () => {
    createNote();
  };

  const handleClipSaveAsNote = useCallback(
    (title: string, markdown: string) => {
      createNoteWithContent(title, markdown);
      setShowClipper(false);
    },
    [createNoteWithContent]
  );

  const handleSelectNote = (id: string) => {
    cleanupEmptyNotes();
    setActiveNoteId(id);
  };

  const handleOpenHistory = () => {
    // Dismiss all floating menus
    document.querySelectorAll("[data-tippy-root]").forEach((el) => {
      const instance = (el as any)._tippy;
      if (instance) instance.hide();
    });
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.getSelection()?.removeAllRanges();
    setShowHistory(true);
  };

  return (
    <div
      id="blacknote-root"
      className="relative flex h-screen w-full overflow-hidden"
      style={{ backgroundColor: "hsl(var(--background))" }}
    >
      {/* ─── Sign Out Overlay ─── */}
      <AnimatePresence>
        {isSigningOut && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm"
          >
            <LoaderIcon size={20} className="text-muted-foreground animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Header Bar ─── */}
      <div 
        ref={headerRef}
        className="absolute z-30 flex items-center justify-between pointer-events-none"
        style={{
          top: 0,
          left: 0,
          right: 0,
          height: 44,
          paddingLeft: 8,
          paddingRight: 8,
          borderRadius: 0,
          backgroundColor: 'transparent',
          backdropFilter: 'none',
          boxShadow: 'none',
          willChange: 'top, left, right, height, border-radius, background-color, backdrop-filter, box-shadow',
        }}
      >
        {/* Left Section */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Identity Pill — Login / Avatar + Badge */}
          <div className="relative">
            {!user ? (
              /* Not logged in: Google Login pill */
              <button
                onClick={handleLogin}
                className="identity-pill"
                data-tooltip="Sign in with Google"
                disabled={isLoggingIn}
                style={isLoggingIn ? { paddingRight: "2px" } : {}}
              >
                {isLoggingIn ? (
                  <LoaderIcon size={20} className="text-muted-foreground" />
                ) : (
                  <>
                    <GoogleIcon />
                    <span className="identity-pill-text">Login</span>
                  </>
                )}
              </button>
            ) : (
              /* Logged in: Avatar + PRO/UPGRADE pill */
              <div className="identity-pill" style={{ cursor: "pointer" }}>
                <button
                  onClick={() => setShowAccountMenu(!showAccountMenu)}
                  className="shrink-0 rounded-full focus:outline-none"
                  data-tooltip="Account"
                >
                  {getUserAvatar(user) ? (
                    <img
                      src={getUserAvatar(user)!}
                      className="w-5 h-5 rounded-full"
                      alt=""
                    />
                  ) : (
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold"
                      style={{
                        backgroundColor: "hsl(var(--primary))",
                        color: "hsl(var(--primary-foreground))",
                      }}
                    >
                      {(user.user_metadata?.full_name || user.email || "U")
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                  )}
                </button>

                {/* Badge */}
                {credits === null ? (
                  <div
                    className="w-10 h-3.5 rounded-sm animate-pulse shrink-0"
                    style={{ backgroundColor: "hsl(var(--muted))" }}
                  />
                ) : isPremium ? (
                  (() => {
                    const ProIcon = proIconIndex === 0 ? ChessKingIcon : proIconIndex === 1 ? HandMetalIcon : HeartHandshakeIcon;
                    return (
                      <div className="flex items-center gap-1 pr-0.5">
                        <div 
                          className="identity-pill-badge-upgrade group flex items-center overflow-hidden"
                          onMouseEnter={() => headerProIconRef.current?.startAnimation()}
                          onMouseLeave={() => headerProIconRef.current?.stopAnimation()}
                        >
                          <ProIcon ref={headerProIconRef} size={18} />
                          <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 group-hover:max-w-[80px] group-hover:opacity-100 group-hover:ml-1 transition-all duration-300 ease-in-out font-bold">
                            PRO
                          </span>
                        </div>
                        {isQuotaExhausted && (
                          <CircleHelpIcon
                            className="w-3 h-3 cursor-help"
                            style={{ color: "hsl(45 90% 55%)" }}
                            data-tooltip="Credits exhausted. Using free tier."
                          />
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const url = `${CHECKOUT_BASE}?checkout[email]=${encodeURIComponent(user.email || "")}&checkout[custom][user_id]=${user.id}`;
                      chrome.tabs.create({ url });
                    }}
                    className="identity-pill-badge-upgrade group flex items-center overflow-hidden"
                    data-tooltip="Upgrade to Pro"
                  >
                    <ArrowBigUpDashIcon size={18} />
                    <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 group-hover:max-w-[80px] group-hover:opacity-100 group-hover:ml-1 transition-all duration-300 ease-in-out">
                      UPGRADE
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* History */}
          <button
            className="floating-header-btn"
            onClick={handleOpenHistory}
            data-tooltip="History"
          >
            <HistoryIcon className="w-[17px] h-[17px]" />
          </button>

          {/* Theme Toggle */}
          <button
            className="floating-header-btn"
            onClick={toggleTheme}
            data-tooltip={theme === "light" ? "Dark mode" : "Light mode"}
          >
            {theme === "light" ? <MoonIcon className="w-[17px] h-[17px]" /> : <SunIcon className="w-[17px] h-[17px]" />}
          </button>

          {/* Web Clipper */}
          <button
            className="floating-header-btn"
            onClick={() => setShowClipper(!showClipper)}
            data-tooltip="Clip page"
            style={{
              opacity: showClipper ? 1 : undefined,
            }}
          >
            <EarthIcon className="w-[17px] h-[17px]" />
          </button>
        </div>

        {/* Right Section */}
        <button
          className="floating-header-btn pointer-events-auto"
          onClick={handleCreateNote}
          data-tooltip="New note"
        >
          <PlusIcon className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* ─── Main Content ─── */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <NoteEditor
          note={activeNote}
          theme={theme}
          onContentChange={handleContentChange}
          onTitleChange={handleTitleChange}
          onCreateNote={handleCreateNote}
          onScrollProgress={handleScrollProgress}
        />
      </div>

      {/* ─── History Bottom Sheet ─── */}
      <AnimatePresence>
        {showHistory && (
          <HistorySheet
            notes={notes}
            activeNoteId={activeNoteId ?? ""}
            loading={notesLoading}
            onSelectNote={handleSelectNote}
            onCreateNote={handleCreateNote}
            onDeleteNote={deleteNote}
            onClose={() => {
              cleanupEmptyNotes();
              setShowHistory(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* ─── Web Clipper Bottom Sheet ─── */}
      <AnimatePresence>
        {showClipper && (
          <>
            <motion.div
              className="history-sheet-backdrop"
              onClick={() => setShowClipper(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.div
              className="clipper-sheet"
              initial={{ bottom: "-100%" }}
              animate={{ bottom: 0 }}
              exit={{ bottom: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 350, mass: 0.8 }}
            >
              <div className="history-sheet-handle" onClick={() => setShowClipper(false)}>
                <div className="history-sheet-handle-bar" />
              </div>
              <div className="clipper-sheet-content">
                <WebClipper
                  onSaveAsNote={handleClipSaveAsNote}
                  onClose={() => setShowClipper(false)}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ─── Account Bottom Sheet ─── */}
      <AnimatePresence>
        {showAccountMenu && user && (
          <>
            <motion.div
              className="history-sheet-backdrop"
              onClick={() => setShowAccountMenu(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.div
              className="clipper-sheet"
              initial={{ bottom: "-100%" }}
              animate={{ bottom: 0 }}
              exit={{ bottom: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 350, mass: 0.8 }}
            >
              <div className="history-sheet-handle" onClick={() => setShowAccountMenu(false)}>
                <div className="history-sheet-handle-bar" />
              </div>
              <div className="clipper-sheet-content" style={{ padding: 0 }}>
                <AccountPopup
                  user={user}
                  credits={credits}
                  proIconIndex={proIconIndex}
                  onSignOut={async () => {
                    setShowAccountMenu(false);
                    setIsSigningOut(true);
                    await signOut();
                  }}
                  onClose={() => setShowAccountMenu(false)}
                  onRefreshCredits={refreshCredits}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ─── AI Error Sheet ─── */}
      <AIErrorSheet
        visible={aiErrorVisible}
        onDismiss={() => setAiErrorVisible(false)}
        user={user}
        isPremium={isPremium}
        isQuotaExhausted={isQuotaExhausted}
        onLogin={handleLogin}
        onUpgrade={() => {
          if (user?.email) {
            const url = `${CHECKOUT_BASE}?checkout[email]=${encodeURIComponent(user.email)}&checkout[custom][user_id]=${user.id}`;
            chrome.tabs.create({ url });
          }
        }}
      />

      <GlobalTooltip />
    </div>
  );
}
