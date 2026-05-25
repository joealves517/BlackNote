import { useState, useCallback, useEffect, useRef } from "react";
import { db, type LocalNote } from "@/lib/local-db";
import {
  fullSync,
  pushNote,
  deleteRemoteNote,
  type SyncProgress,
} from "@/lib/sync-engine";
import { markdownToProsemirror } from "@/lib/markdown-to-prosemirror";
import { showSyncingToast, showSyncSuccessToast, showSyncErrorToast } from "@/lib/toast";

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  chatHistory: { role: string; content: string }[];
  mediaTranscripts?: string;
  isPinned?: boolean;
  color?: string;
  tags?: string[];
}

function localToNote(row: LocalNote): Note {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    chatHistory: row.chatHistory ? JSON.parse(row.chatHistory) : [],
    mediaTranscripts: row.mediaTranscripts,
    isPinned: row.isPinned ?? false,
    color: row.color,
    tags: row.tags,
  };
}


export function useNotes() {
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<Record<string, Partial<LocalNote>>>({});
  const { user } = useAuth();
  const userId = user?.id;
  const [loading, setLoading] = useState(true);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    status: "idle",
    current: 0,
    total: 0,
    message: "",
  });

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
              type: "audioNode",
              attrs: {
                mediaId: "welcome-audio",
                status: "saved",
                duration: 63,
                fileName: "Welcome to BlackNote 🎙️"
              }
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: "Welcome to your intelligent workspace! Here are some powerful features to get you started:" }]
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
                        { type: "text", marks: [{ type: "bold" }], text: "Audio & Video AI: " },
                        { type: "text", text: "Click the " },
                        { type: "text", marks: [{ type: "textStyle", attrs: { color: "#fbbf24" } }, { type: "bold" }], text: "Audio or Video icons" },
                        { type: "text", text: " in the " },
                        { type: "text", marks: [{ type: "bold" }], text: "Right Toolbar" },
                        { type: "text", text: " to record media directly into your note. Then, click the media block to transcribe, summarize, and even " },
                        { type: "text", marks: [{ type: "textStyle", attrs: { color: "#a855f7" } }, { type: "bold" }], text: "Chat with Video/Audio" },
                        { type: "text", text: " to extract key points." }
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
                        { type: "text", marks: [{ type: "bold" }], text: "Autonomous AI Agent: " },
                        { type: "text", text: "Use the " },
                        { type: "text", marks: [{ type: "bold" }], text: "Agent input box" },
                        { type: "text", text: " at the bottom of the editor to command the AI to autonomously write, edit, format, or translate content. Watch it work and " },
                        { type: "text", marks: [{ type: "bold" }], text: "review changes inline" },
                        { type: "text", text: " block-by-block!" }
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
                        { type: "text", marks: [{ type: "bold" }], text: "Chat with Note: " },
                        { type: "text", text: "Click the " },
                        { type: "text", marks: [{ type: "textStyle", attrs: { color: "#3b82f6" } }, { type: "bold" }], text: "Message Square icon" },
                        { type: "text", text: " in the " },
                        { type: "text", marks: [{ type: "bold" }], text: "Right Toolbar" },
                        { type: "text", text: " to open the chat panel and talk directly with your document. Ask questions, extract insights, and get instant answers." }
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
                        { type: "text", marks: [{ type: "bold" }], text: "Smart Commands: " },
                        { type: "text", text: "Type " },
                        { type: "text", marks: [{ type: "textStyle", attrs: { color: "#fbbf24" } }, { type: "bold" }], text: "/" },
                        { type: "text", text: " anywhere to quickly insert text formatting, headings, or lists." }
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
                        { type: "text", marks: [{ type: "bold" }], text: "Web Clipper: " },
                        { type: "text", text: "Click the " },
                        { type: "text", marks: [{ type: "textStyle", attrs: { color: "#3b82f6" } }, { type: "bold" }], text: "Scan Line icon" },
                        { type: "text", text: " in the " },
                        { type: "text", marks: [{ type: "bold" }], text: "Right Toolbar" },
                        { type: "text", text: " to instantly capture web pages and save them directly into your notes." }
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
                        { type: "text", marks: [{ type: "bold" }], text: "Seamless Sync: " },
                        { type: "text", text: "Connect your Google account and never lose a thought. Your notes sync securely across all your devices." }
                      ]
                    }
                  ]
                }
              ]
            },
            {
              type: "paragraph",
              content: [
                { type: "text", marks: [{ type: "textStyle", attrs: { color: "#10b981" } }, { type: "bold" }], text: "Ready to elevate your productivity? Happy writing! 🚀" }
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

        // Inject the welcome audio into IndexedDB
        try {
          const url = chrome.runtime.getURL("welcome-blacknote.mp3");
          const res = await fetch(url);
          if (res.ok) {
            const blob = await res.blob();
            await db.media_files.put({
              id: "welcome-audio",
              noteId: firstNote.id,
              type: "audio",
              blob,
              duration: 63,
              fileName: "Welcome to BlackNote 🎙️",
              createdAt: now,
            });
            await db.media_transcripts.put({
              mediaId: "welcome-audio",
              segments: [],
              transcript: "Welcome to BlackNote, your intelligent workspace! Here are some powerful features to get you started. Click the Audio or Video icons in the Right Toolbar to record media directly into your note. Then, click the media block to transcribe, summarize, and even chat with your media to extract key points. With our new Autonomous AI Agent, use the Agent input box at the bottom of the editor to command the AI to autonomously write, edit, format, or translate content. Watch it work and review changes inline! You can also chat directly with your document by clicking the Message Square icon in the Right Toolbar. Ask questions, extract insights, and get instant answers. Type a slash anywhere to quickly insert text formatting. The Web Clipper lets you instantly capture web pages by clicking the Scan Line icon in the Right Toolbar, saving them directly to your notes. And with seamless sync, simply connect your Google account to keep all your ideas securely across your devices. Ready to elevate your productivity? Happy writing!",
              language: "en",
              analyzedAt: now,
            });
          }
        } catch (err) {
          console.error("Failed to inject welcome audio", err);
        }
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
      Promise.all(welcomeNotes.map(n => {
        if (userId) {
          deleteRemoteNote(n.id).catch(err => console.error("Failed to delete welcome note remotely", err));
        }
        return db.notes.delete(n.id);
      })).then(() => {
        setNotes((prev) => {
          const filtered = prev.filter((n) => n.title !== "Welcome to BlackNote 👋");
          if (welcomeNotes.some(wn => wn.id === activeNoteId) && filtered.length > 0) {
            setActiveNoteId(filtered[0].id);
          }
          return filtered;
        });
      });
    }
  }, [notes.length, activeNoteId, userId]);

  // Sync when user logs in
  useEffect(() => {
    if (!userId || syncedForUser.current === userId) return;

    syncedForUser.current = userId;

    const runSync = async () => {
      showSyncingToast();
      let lastProgress: SyncProgress | null = null;

      try {
        await fullSync(userId, (progress) => {
          setSyncProgress(progress);
          lastProgress = progress;
        });

        // Reload local notes after sync merge
        const mapped = await loadFromLocal();
        if (mapped.length > 0 && !activeNoteId) {
          setActiveNoteId(mapped[0].id);
        }

        if (lastProgress && (lastProgress as any).status === "done") {
          showSyncSuccessToast((lastProgress as any).total);
        } else if (lastProgress && (lastProgress as any).status === "error") {
          showSyncErrorToast();
        }
      } catch (err) {
        showSyncErrorToast();
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
    (id: string, updates: Partial<Pick<Note, "title" | "content" | "chatHistory" | "mediaTranscripts" | "isPinned" | "color" | "tags">>) => {
      const now = Date.now();
      const isMetaOnly = Object.keys(updates).every((k) => ["isPinned", "color", "tags"].includes(k));

      let extractedTags: string[] | undefined = updates.tags;
      if (updates.content !== undefined) {
        try {
          const doc = JSON.parse(updates.content);
          const tags = new Set<string>();
          const traverse = (node: any) => {
            if (node.type === "hashtag" && node.attrs?.id) {
              tags.add(node.attrs.id);
            }
            if (node.content && Array.isArray(node.content)) {
              node.content.forEach(traverse);
            }
          };
          traverse(doc);
          extractedTags = Array.from(tags);
        } catch(e) {}
      }

      // Optimistic UI update
      setNotes((prev) =>
        prev.map((note) =>
          note.id === id
            ? { ...note, ...updates, tags: extractedTags !== undefined ? extractedTags : note.tags, updatedAt: isMetaOnly ? note.updatedAt : new Date(now) }
            : note
        ).sort(sortNotes)
      );

      // Accumulate pending updates for DB write
      if (!pendingUpdatesRef.current[id]) {
        pendingUpdatesRef.current[id] = { syncedAt: null };
      }
      if (!isMetaOnly) {
        pendingUpdatesRef.current[id].updatedAt = now;
      }
      if (updates.title !== undefined) pendingUpdatesRef.current[id].title = updates.title;
      if (updates.content !== undefined) pendingUpdatesRef.current[id].content = updates.content;
      if (extractedTags !== undefined) pendingUpdatesRef.current[id].tags = extractedTags;
      if (updates.chatHistory !== undefined) pendingUpdatesRef.current[id].chatHistory = JSON.stringify(updates.chatHistory) as any;
      if (updates.mediaTranscripts !== undefined) pendingUpdatesRef.current[id].mediaTranscripts = updates.mediaTranscripts;
      if (updates.isPinned !== undefined) pendingUpdatesRef.current[id].isPinned = updates.isPinned;
      if (updates.color !== undefined) pendingUpdatesRef.current[id].color = updates.color;
      if (updates.tags !== undefined) pendingUpdatesRef.current[id].tags = updates.tags;

      // Debounce persist to IndexedDB + optional cloud sync
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        // Capture all pending updates and clear the ref
        const allPending = { ...pendingUpdatesRef.current };
        pendingUpdatesRef.current = {};
        
        for (const [noteId, dbUpdates] of Object.entries(allPending)) {
          await db.notes.update(noteId, dbUpdates);
          
          // Background cloud sync
          if (userId) {
            const note = await db.notes.get(noteId);
            if (note) pushNote(note, userId);
          }
        }
      }, 400);
    },
    [userId]
  );

  const deleteNote = useCallback(
    async (id: string) => {
      // Determine next active note before updating state
      let nextActiveId = activeNoteId;
      if (activeNoteId === id) {
        const filtered = notes.filter((n) => n.id !== id);
        nextActiveId = filtered.length > 0 ? filtered[0].id : null;
      }

      // Optimistic delete
      setActiveNoteId(nextActiveId);
      setNotes((prev) => prev.filter((n) => n.id !== id));

      // Extract mediaIds to clean up before deleting the note
      const noteToDelete = await db.notes.get(id);
      if (noteToDelete && noteToDelete.content) {
        try {
          const doc = typeof noteToDelete.content === "string" ? JSON.parse(noteToDelete.content) : noteToDelete.content;
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
    [activeNoteId, userId, notes]
  );

  const setActiveNoteIdWithCleanup = useCallback(
    (newId: string | null) => {
      if (activeNoteId && activeNoteId !== newId) {
        const currentActive = notes.find((n) => n.id === activeNoteId);
        if (isNoteEmpty(currentActive)) {
          // Inline synchronous state removal so React batches it
          // with setActiveNoteId into a single render — no null flash
          const removedId = activeNoteId;
          setNotes((prev) => prev.filter((n) => n.id !== removedId));

          // Fire-and-forget DB + cloud cleanup (no await = no extra render)
          db.notes.delete(removedId).catch(() => {});
          if (userId) deleteRemoteNote(removedId);
        }
      }
      setActiveNoteId(newId);
    },
    [activeNoteId, notes, userId]
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
