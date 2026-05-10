import { useState, useCallback, useEffect, useRef } from "react";
import { db, type LocalNote } from "@/lib/local-db";
import {
  fullSync,
  pushNote,
  deleteRemoteNote,
  type SyncProgress,
} from "@/lib/sync-engine";
import { markdownToProsemirror } from "@/lib/markdown-to-prosemirror";

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  chatHistory: { role: string; content: string }[];
  isPinned?: boolean;
}

function localToNote(row: LocalNote): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    chatHistory: row.chatHistory ? JSON.parse(row.chatHistory) : [],
    isPinned: row.isPinned ?? false,
  };
}


export function useNotes(userId: string | undefined) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    status: "idle",
    current: 0,
    total: 0,
    message: "",
  });

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncedForUser = useRef<string | null>(null);

  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null;

  const isNoteEmpty = (note: Note | null | undefined): boolean => {
    if (!note) return false;
    if (note.chatHistory && note.chatHistory.length > 0) return false;
    if (note.title.trim() !== "" && note.title.trim() !== "Untitled") return false;
    if (!note.content) return true;
    try {
      const parsed = JSON.parse(note.content);
      if (!parsed || !parsed.content || parsed.content.length === 0) return true;
      if (parsed.content.length === 1 && parsed.content[0].type === "paragraph" && !parsed.content[0].content) return true;
      return false;
    } catch {
      return true;
    }
  };

  const sortNotes = (a: Note, b: Note) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  };

  const filteredNotes = notes.filter((note) =>
    note.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Reload notes from IndexedDB
  const loadFromLocal = useCallback(async () => {
    const rows = await db.notes.orderBy("updatedAt").reverse().toArray();
    const mapped = rows.map(localToNote).sort(sortNotes);
    setNotes(mapped);
    return mapped;
  }, []);

  // Load local notes on mount — auto-create if empty
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      let mapped = await loadFromLocal();

      // No notes at all → create one automatically
      if (mapped.length === 0) {
        const now = Date.now();
        const welcomeDoc = {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Here are some tips to get you started:" }]
            },
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        { type: "text", text: "Type " },
                        { type: "text", marks: [{ type: "textStyle", attrs: { color: "#fbbf24" } }, { type: "bold" }], text: "/" },
                        { type: "text", text: " to open the command menu and access headings, lists, or Ask AI." }
                      ]
                    }
                  ]
                },
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        { type: "text", text: "Highlight any text and press " },
                        { type: "text", marks: [{ type: "textStyle", attrs: { color: "#a855f7" } }, { type: "bold" }], text: "Ask AI" },
                        { type: "text", text: " to instantly rewrite, summarize, or translate it." }
                      ]
                    }
                  ]
                },
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        { type: "text", text: "Connect your Google account to sync notes seamlessly across all your devices." }
                      ]
                    }
                  ]
                },
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        { type: "text", text: "Explore the " },
                        { type: "text", marks: [{ type: "textStyle", attrs: { color: "#3b82f6" } }, { type: "bold" }], text: "Web Clipper" },
                        { type: "text", text: " to save web pages directly into your notes." }
                      ]
                    }
                  ]
                }
              ]
            },
            {
              type: "paragraph",
              content: [
                { type: "text", marks: [{ type: "textStyle", attrs: { color: "#10b981" } }, { type: "bold" }], text: "Happy writing! 🚀" }
              ]
            }
          ]
        };
        
        const firstNote: LocalNote = {
          id: crypto.randomUUID(),
          title: "Welcome to BlackNote 👋",
          content: JSON.stringify(welcomeDoc),
          createdAt: now,
          updatedAt: now,
          syncedAt: null,
        };
        await db.notes.add(firstNote);
        mapped = [localToNote(firstNote)];
        setNotes(mapped);
      }

      if (!activeNoteId) {
        setActiveNoteId(mapped[0].id);
      }
      setLoading(false);
    };
    init();
  }, []);
  // Auto-cleanup ALL Welcome notes if user has other notes
  useEffect(() => {
    const welcomeNotes = notes.filter((n) => n.title === "Welcome to BlackNote 👋");
    if (welcomeNotes.length > 0 && notes.length > welcomeNotes.length) {
      Promise.all(welcomeNotes.map(n => db.notes.delete(n.id))).then(() => {
        setNotes((prev) => {
          const filtered = prev.filter((n) => n.title !== "Welcome to BlackNote 👋");
          if (welcomeNotes.some(wn => wn.id === activeNoteId) && filtered.length > 0) {
            setActiveNoteId(filtered[0].id);
          }
          return filtered;
        });
      });
    }
  }, [notes.length, activeNoteId]);

  // Sync when user logs in
  useEffect(() => {
    if (!userId || syncedForUser.current === userId) return;

    syncedForUser.current = userId;

    const runSync = async () => {
      await fullSync(userId, (progress) => {
        setSyncProgress(progress);
      });

      // Reload local notes after sync merge
      const mapped = await loadFromLocal();
      if (mapped.length > 0 && !activeNoteId) {
        setActiveNoteId(mapped[0].id);
      }

      // Auto-hide progress after 3s
      setTimeout(() => {
        setSyncProgress((prev) =>
          prev.status === "done" ? { ...prev, status: "idle" } : prev
        );
      }, 3000);
    };

    runSync();
  }, [userId, loadFromLocal]);

  const createNote = useCallback(async () => {
    const currentNote = notes.find((n) => n.id === activeNoteId);
    if (isNoteEmpty(currentNote)) {
      return; // Already on an empty note
    }

    const now = Date.now();
    const newNote: LocalNote = {
      id: crypto.randomUUID(),
      title: "Untitled",
      content: "",
      createdAt: now,
      updatedAt: now,
      syncedAt: null,
    };

    await db.notes.add(newNote);

    const mapped = localToNote(newNote);
    setNotes((prev) => [mapped, ...prev].sort(sortNotes));
    setActiveNoteId(mapped.id);

    // Background sync if logged in
    if (userId) {
      pushNote(newNote, userId);
    }
  }, [userId, notes, activeNoteId]);

  /** Create a note pre-filled with title and markdown content (used by Web Clipper) */
  const createNoteWithContent = useCallback(
    async (title: string, markdownContent: string) => {
      const now = Date.now();
      const prosemirrorDoc = markdownToProsemirror(markdownContent);

      const newNote: LocalNote = {
        id: crypto.randomUUID(),
        title,
        content: prosemirrorDoc,
        createdAt: now,
        updatedAt: now,
        syncedAt: null,
      };

      await db.notes.add(newNote);
      const mapped = localToNote(newNote);
      setNotes((prev) => [mapped, ...prev].sort(sortNotes));
      setActiveNoteId(mapped.id);

      if (userId) {
        pushNote(newNote, userId);
      }

      return mapped.id;
    },
    [userId]
  );

  const updateNote = useCallback(
    (id: string, updates: Partial<Pick<Note, "title" | "content" | "chatHistory" | "isPinned">>) => {
      const now = Date.now();
      const isPinOnly = Object.keys(updates).length === 1 && "isPinned" in updates;

      // Optimistic UI update
      setNotes((prev) =>
        prev.map((note) =>
          note.id === id
            ? { ...note, ...updates, updatedAt: isPinOnly ? note.updatedAt : new Date(now) }
            : note
        ).sort(sortNotes)
      );

      // Debounce persist to IndexedDB + optional cloud sync
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        const dbUpdates: Partial<LocalNote> = { syncedAt: null };
        if (!isPinOnly) {
          dbUpdates.updatedAt = now;
        }
        if (updates.title !== undefined) dbUpdates.title = updates.title;
        if (updates.content !== undefined) dbUpdates.content = updates.content;
        if (updates.chatHistory !== undefined) dbUpdates.chatHistory = JSON.stringify(updates.chatHistory);
        if (updates.isPinned !== undefined) dbUpdates.isPinned = updates.isPinned;

        await db.notes.update(id, dbUpdates);

        // Background cloud sync
        if (userId) {
          const note = await db.notes.get(id);
          if (note) pushNote(note, userId);
        }
      }, 400);
    },
    [userId]
  );

  const deleteNote = useCallback(
    async (id: string) => {
      // Optimistic delete
      setNotes((prev) => {
        const filtered = prev.filter((n) => n.id !== id);
        if (activeNoteId === id && filtered.length > 0) {
          setActiveNoteId(filtered[0].id);
        } else if (filtered.length === 0) {
          setActiveNoteId(null);
        }
        return filtered;
      });

      // Extract mediaIds to clean up before deleting the note
      const noteToDelete = await db.notes.get(id);
      if (noteToDelete && noteToDelete.content) {
        try {
          const doc = JSON.parse(noteToDelete.content);
          const extractMediaIds = (node: any): string[] => {
            let ids: string[] = [];
            if (node.type === "audioNode" || node.type === "videoNode") {
              if (node.attrs && node.attrs.mediaId) ids.push(node.attrs.mediaId);
            }
            if (node.content && Array.isArray(node.content)) {
              for (const child of node.content) {
                ids = ids.concat(extractMediaIds(child));
              }
            }
            return ids;
          };
          const mediaIds = extractMediaIds(doc);
          if (mediaIds.length > 0) {
            await Promise.all(mediaIds.map((mediaId) => db.media_files.delete(mediaId)));
          }
        } catch (err) {
          console.warn("Failed to parse note content for media cleanup", err);
        }
      }

      await db.notes.delete(id);

      // Background cloud delete
      if (userId) {
        deleteRemoteNote(id);
      }
    },
    [activeNoteId, userId]
  );

  const setActiveNoteIdWithCleanup = useCallback(
    (newId: string | null) => {
      if (activeNoteId && activeNoteId !== newId) {
        const currentActive = notes.find((n) => n.id === activeNoteId);
        if (isNoteEmpty(currentActive)) {
          deleteNote(activeNoteId);
        }
      }
      setActiveNoteId(newId);
    },
    [activeNoteId, notes, deleteNote]
  );

  return {
    notes: filteredNotes,
    allNotes: notes,
    activeNote,
    activeNoteId,
    searchQuery,
    loading,
    syncProgress,
    setActiveNoteId: setActiveNoteIdWithCleanup,
    setSearchQuery,
    createNote,
    createNoteWithContent,
    updateNote,
    deleteNote,
  };
}
