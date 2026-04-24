import { useState, useCallback, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { NoteEditor } from "@/components/NoteEditor";
import { AIErrorToast } from "@/components/AIErrorToast";
import { GlobalTooltip } from "@/components/Tooltip";
import { useNotes } from "@/hooks/use-notes";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useCredits } from "@/hooks/use-credits";
import { ArrowLeft } from "lucide-react";


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
  } = useNotes(user?.id);

  const { theme, toggleTheme } = useTheme();
  const { credits, refreshCredits } = useCredits(user?.id);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aiErrorVisible, setAiErrorVisible] = useState(false);
  const [aiErrorIsRefund, setAiErrorIsRefund] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Onboarding logic
  useEffect(() => {
    (window as any).resetOnboarding = () => {
      localStorage.removeItem("blacknote_onboarding_v2");
      setShowOnboarding(true);
      console.log("Onboarding forcefully triggered for testing.");
    };

    const hasSeen = localStorage.getItem("blacknote_onboarding_v2");
    console.log("Onboarding initialized, hasSeen:", hasSeen);
    if (!hasSeen) {
      const timer = setTimeout(() => {
        const isInteracted = localStorage.getItem("blacknote_onboarding_v2");
        console.log("Timeout triggered. isInteracted:", isInteracted);
        if (!isInteracted) {
          setShowOnboarding(true);
          localStorage.setItem("blacknote_onboarding_v2", "true");
          console.log("Setting showOnboarding to true");
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (sidebarOpen) {
      setShowOnboarding(false);
      localStorage.setItem("blacknote_onboarding_v2", "true");
    }
  }, [sidebarOpen]);

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
            />
          </div>
        </>
      )}

      {/* Edge trigger — absolute overlay, doesn't push content */}
      {!sidebarOpen && (
        <>
          <div
            className="sidebar-edge-trigger"
            onClick={handleToggleSidebar}
            data-tooltip="Open notes"
          />
          {showOnboarding && (
            <div className="onboarding-tooltip">
              <div className="onboarding-arrow">
                <ArrowLeft size={20} />
              </div>
              <div className="onboarding-text">Open Notes</div>
            </div>
          )}
        </>
      )}

      {/* Main Content — full width */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
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
