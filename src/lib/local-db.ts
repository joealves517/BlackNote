import Dexie, { type EntityTable } from "dexie";

export interface LocalNote {
  id: string;
  title: string;
  content: string;
  createdAt: number; // timestamp ms
  updatedAt: number; // timestamp ms
  syncedAt: number | null; // null = never synced
}

const db = new Dexie("blacknote") as Dexie & {
  notes: EntityTable<LocalNote, "id">;
};

db.version(1).stores({
  notes: "id, updatedAt",
});

export { db };
