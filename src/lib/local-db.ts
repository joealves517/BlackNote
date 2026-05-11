import Dexie, { type EntityTable } from "dexie";

export interface LocalNote {
  id: string;
  title: string;
  content: string;
  createdAt: number; // timestamp ms
  updatedAt: number; // timestamp ms
  syncedAt: number | null; // null = never synced
  chatHistory?: string; // JSON string of chat messages
  mediaTranscripts?: string; // JSON string of Record<string, MediaTranscript>
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

export interface MediaTranscript {
  mediaId: string;
  segments: { start: number; end: number; text: string }[];
  transcript: string;
  language: string;
  analyzedAt: number;
}

export interface MediaChunk {
  id: string;
  mediaId: string;
  chunkIndex: number;
  blob: Blob;
  duration: number;
  status: "pending" | "processing" | "done" | "error";
  transcript?: string;
  segments?: { start: number; end: number; text: string }[];
}

export interface MediaTempChunk {
  id: string;
  mediaId: string;
  chunkIndex: number;
  blob: Blob;
}

const db = new Dexie("blacknote") as Dexie & {
  notes: EntityTable<LocalNote, "id">;
  media_files: EntityTable<MediaFile, "id">;
  media_transcripts: EntityTable<MediaTranscript, "mediaId">;
  media_chunks: EntityTable<MediaChunk, "id">;
  media_temp_chunks: EntityTable<MediaTempChunk, "id">;
};

db.version(1).stores({
  notes: "id, updatedAt",
});

db.version(2).stores({
  notes: "id, updatedAt",
  media_files: "id, noteId, type, createdAt",
});

db.version(3).stores({
  notes: "id, updatedAt",
  media_files: "id, noteId, type, createdAt",
  media_transcripts: "mediaId",
});

db.version(4).stores({
  notes: "id, updatedAt",
  media_files: "id, noteId, type, createdAt",
  media_transcripts: "mediaId",
  media_chunks: "id, mediaId, chunkIndex, status",
});

db.version(5).stores({
  notes: "id, updatedAt",
  media_files: "id, noteId, type, createdAt",
  media_transcripts: "mediaId",
  media_chunks: "id, mediaId, chunkIndex, status",
  media_temp_chunks: "id, mediaId, chunkIndex",
});

export { db };
