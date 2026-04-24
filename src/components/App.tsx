import { useState, useCallback, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { NoteEditor } from "@/components/NoteEditor";
import { AIErrorToast } from "@/components/AIErrorToast";
import { GlobalTooltip } from "@/components/Tooltip";
import { useNotes } from "@/hooks/use-notes";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useCredits } from "@/hooks/use-credits";
import { Menu, Plus } from "lucide-react";

function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l3.68-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.68 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export function App() {
  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuth();
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiErrorVisible, setAiErrorVisible] = useState(false);
  const [aiErrorIsRefund, setAiErrorIsRefund] = useState(false);
  // Listen for AI error events from the editor
  useEffect(() => {
    const handler = () => {
      setAiErrorIsRefund(false);
      setAiErrorVisible(true);
    };
    const handlerRefund = () => {
      setAiErrorIsRefund(true);
      setAiErrorVisible(true);
    };
    window.addEventListener("ai-error", handler);
    window.addEventListener("ai-error-refunded", handlerRefund);
    return () => {
      window.removeEventListener("ai-error", handler);
      window.removeEventListener("ai-error-refunded", handlerRefund);
    };
  }, []);

  // Listen for slash command "/clip" → open sidebar with WebClipper
  useEffect(() => {
    const handleOpenClipper = () => {
      setSidebarOpen(true);
      // Small delay to let sidebar render, then trigger clipper via custom event
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("trigger-clipper"));
      }, 100);
    };
    window.addEventListener("open-web-clipper", handleOpenClipper);
    return () => window.removeEventListener("open-web-clipper", handleOpenClipper);
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
    setSidebarOpen(false);
  };

  const handleClipSaveAsNote = useCallback(
    (title: string, markdown: string) => {
      createNoteWithContent(title, markdown);
      setSidebarOpen(false);
    },
    [createNoteWithContent]
  );


  const handleSelectNote = (id: string) => {
    cleanupEmptyNotes();
    setActiveNoteId(id);
    setSidebarOpen(false);
  };

  const handleToggleSidebar = () => {
    if (sidebarOpen) {
      cleanupEmptyNotes();
    } else {
      // Opening sidebar: dismiss all floating menus (Tippy instances)
      document.querySelectorAll("[data-tippy-root]").forEach((el) => {
        const instance = (el as any)._tippy;
        if (instance) instance.hide();
      });
      // Also blur editor to ensure bubble menu unmounts
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      window.getSelection()?.removeAllRanges();
    }
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div
      className="relative flex h-screen w-full overflow-hidden"
      style={{ backgroundColor: "hsl(var(--background))" }}
    >
      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <>
          <div
            className="absolute inset-0 z-10"
            style={{ backgroundColor: "hsl(var(--foreground) / 0.08)" }}
            onClick={handleToggleSidebar}
          />
          <div
            className="absolute top-0 left-0 h-full z-20 transition-sidebar"
            style={{ width: "280px" }}
          >
            <Sidebar
              notes={notes}
              activeNoteId={activeNoteId ?? ""}
              searchQuery={searchQuery}
              theme={theme}
              loading={notesLoading}
              user={user}
              credits={credits}
              syncProgress={syncProgress}
              onSelectNote={handleSelectNote}
              onCreateNote={handleCreateNote}
              onDeleteNote={deleteNote}
              onSearchChange={setSearchQuery}
              onToggleTheme={toggleTheme}
              onSignInWithGoogle={signInWithGoogle}
              onSignOut={signOut}
              onRefreshCredits={refreshCredits}
              onClipSaveAsNote={handleClipSaveAsNote}
            />
          </div>
        </>
      )}

      {/* Top Header Bar */}
      {!sidebarOpen && (
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-2 h-11 pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              className="floating-header-btn"
              onClick={handleToggleSidebar}
              data-tooltip="Menu"
            >
              <Menu size={18} />
            </button>
            
            {!user && (
              <button
                onClick={signInWithGoogle}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors hover:opacity-80"
                style={{ 
                  color: "hsl(var(--foreground))", 
                  backgroundColor: "hsl(var(--muted) / 0.5)",
                }}
              >
                <GoogleIcon />
                <span>Login</span>
              </button>
            )}
          </div>

          <button
            className="floating-header-btn pointer-events-auto"
            onClick={handleCreateNote}
            data-tooltip="New note"
          >
            <Plus size={18} />
          </button>
        </div>
      )}

      {/* Main Content — full width */}
      <div className={`flex-1 flex flex-col min-w-0 h-full ${!sidebarOpen ? 'pt-11' : ''}`}>
        <NoteEditor
          note={activeNote}
          theme={theme}
          onContentChange={handleContentChange}
          onTitleChange={handleTitleChange}
          onCreateNote={handleCreateNote}
        />
      </div>

      {/* AI Error Toast — positioned at bottom of screen, hides when sidebar is open */}
      {!sidebarOpen && (
        <AIErrorToast
          visible={aiErrorVisible}
          isRefund={aiErrorIsRefund}
          onDismiss={() => setAiErrorVisible(false)}
          isSignedIn={!!user}
          userEmail={user?.email}
          userId={user?.id}
          onSignIn={signInWithGoogle}
        />
      )}
      <GlobalTooltip />
    </div>
  );
}
