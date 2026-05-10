import Dexie, { type EntityTable } from "dexie";

export interface LocalNote {
  id: string;
  title: string;
  content: string;
  createdAt: number; // timestamp ms
  updatedAt: number; // timestamp ms
  syncedAt: number | null; // null = never synced
  chatHistory?: string; // JSON string of chat messages
  isPinned?: boolean;
}

export interface MediaFile {
  id: string;
  noteId: string;
  type: "audio" | "video";
  blob: Blob;
  duration: number; // seconds
  createdAt: number; // timestamp ms
  fileName: string;
}

const db = new Dexie("blacknote") as Dexie & {
  notes: EntityTable<LocalNote, "id">;
  media_files: EntityTable<MediaFile, "id">;
};

db.version(1).stores({
  notes: "id, updatedAt",
});

db.version(2).stores({
  notes: "id, updatedAt",
  media_files: "id, noteId, type, createdAt",
});

export { db };
