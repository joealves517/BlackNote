import { useState, useCallback, useEffect, useRef } from "react";
import { db, type LocalNote } from "@/lib/local-db";
import {
  fullSync,
  pushNote,
  deleteRemoteNote,
  type SyncProgress,
} from "@/lib/sync-engine";

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

function localToNote(row: LocalNote): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
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

  const filteredNotes = notes.filter((note) =>
    note.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Reload notes from IndexedDB
  const loadFromLocal = useCallback(async () => {
    const rows = await db.notes.orderBy("updatedAt").reverse().toArray();
    const mapped = rows.map(localToNote);
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
        const firstNote: LocalNote = {
          id: crypto.randomUUID(),
          title: "",
          content: "",
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
    setNotes((prev) => [mapped, ...prev]);
    setActiveNoteId(mapped.id);

    // Background sync if logged in
    if (userId) {
      pushNote(newNote, userId);
    }
  }, [userId]);

  const updateNote = useCallback(
    (id: string, updates: Partial<Pick<Note, "title" | "content">>) => {
      const now = Date.now();

      // Optimistic UI update
      setNotes((prev) =>
        prev.map((note) =>
          note.id === id
            ? { ...note, ...updates, updatedAt: new Date(now) }
            : note
        )
      );

      // Debounce persist to IndexedDB + optional cloud sync
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        const dbUpdates: Partial<LocalNote> = { updatedAt: now, syncedAt: null };
        if (updates.title !== undefined) dbUpdates.title = updates.title;
        if (updates.content !== undefined) dbUpdates.content = updates.content;

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

      await db.notes.delete(id);

      // Background cloud delete
      if (userId) {
        deleteRemoteNote(id);
      }
    },
    [activeNoteId, userId]
  );

  return {
    notes: filteredNotes,
    allNotes: notes,
    activeNote,
    activeNoteId,
    searchQuery,
    loading,
    syncProgress,
    setActiveNoteId,
    setSearchQuery,
    createNote,
    updateNote,
    deleteNote,
  };
}
