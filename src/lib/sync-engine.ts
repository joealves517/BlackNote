import { db, type LocalNote } from "@/lib/local-db";
import { supabase, type DbNote } from "@/lib/supabase";

export interface SyncProgress {
  status: "idle" | "syncing" | "done" | "error";
  current: number;
  total: number;
  message: string;
}

type ProgressCallback = (progress: SyncProgress) => void;

function dbToLocal(row: DbNote): LocalNote {
  return {
    id: row.id,
    title: row.title,
    content: JSON.stringify(row.content),
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    syncedAt: Date.now(),
  };
}

function localToDb(note: LocalNote, userId: string): Record<string, unknown> {
  let parsedContent: unknown = [];
  try {
    parsedContent = JSON.parse(note.content);
  } catch {
    parsedContent = [];
  }

  return {
    id: note.id,
    user_id: userId,
    title: note.title,
    content: parsedContent,
    created_at: new Date(note.createdAt).toISOString(),
    updated_at: new Date(note.updatedAt).toISOString(),
  };
}

/**
 * Full sync: merge local IndexedDB ↔ Supabase.
 * Strategy: last-write-wins by updatedAt timestamp.
 */
export async function fullSync(
  userId: string,
  onProgress?: ProgressCallback
): Promise<void> {
  const report = (p: Partial<SyncProgress>) =>
    onProgress?.({
      status: "syncing",
      current: 0,
      total: 0,
      message: "",
      ...p,
    });

  try {
    report({ message: "Fetching cloud data..." });

    // 1. Fetch remote notes
    const { data: remoteRows, error } = await supabase
      .from("notes")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);

    const remoteNotes = (remoteRows as DbNote[]).map(dbToLocal);
    const localNotes = await db.notes.toArray();

    // 2. Build lookup maps
    const remoteMap = new Map(remoteNotes.map((n) => [n.id, n]));
    const localMap = new Map(localNotes.map((n) => [n.id, n]));

    // 3. Determine merge actions
    const toPushToCloud: LocalNote[] = [];
    const toPullToLocal: LocalNote[] = [];

    // Check all local notes
    for (const local of localNotes) {
      const remote = remoteMap.get(local.id);
      if (!remote) {
        // Only exists locally → push to cloud
        toPushToCloud.push(local);
      } else if (local.updatedAt > remote.updatedAt) {
        // Local is newer → push to cloud
        toPushToCloud.push(local);
      }
    }

    // Check all remote notes
    for (const remote of remoteNotes) {
      const local = localMap.get(remote.id);
      if (!local) {
        // Only exists remotely → pull to local
        toPullToLocal.push(remote);
      } else if (remote.updatedAt > local.updatedAt) {
        // Remote is newer → pull to local
        toPullToLocal.push(remote);
      }
    }

    const totalOps = toPushToCloud.length + toPullToLocal.length;

    if (totalOps === 0) {
      // Mark all local notes as synced
      await db.notes.toCollection().modify({ syncedAt: Date.now() });
      onProgress?.({
        status: "done",
        current: 0,
        total: 0,
        message: "Already in sync",
      });
      return;
    }

    let completed = 0;

    // 4. Push local → cloud (upsert)
    if (toPushToCloud.length > 0) {
      report({
        current: completed,
        total: totalOps,
        message: `Uploading ${toPushToCloud.length} notes...`,
      });

      const rows = toPushToCloud.map((n) => localToDb(n, userId));
      const { error: upsertError } = await supabase
        .from("notes")
        .upsert(rows, { onConflict: "id" });

      if (upsertError) {
        console.error("Sync push error:", upsertError.message);
      }

      // Mark as synced locally
      for (const note of toPushToCloud) {
        await db.notes.update(note.id, { syncedAt: Date.now() });
        completed++;
        report({
          current: completed,
          total: totalOps,
          message: `Syncing ${completed}/${totalOps}...`,
        });
      }
    }

    // 5. Pull remote → local
    for (const remote of toPullToLocal) {
      await db.notes.put({ ...remote, syncedAt: Date.now() });
      completed++;
      report({
        current: completed,
        total: totalOps,
        message: `Syncing ${completed}/${totalOps}...`,
      });
    }

    onProgress?.({
      status: "done",
      current: totalOps,
      total: totalOps,
      message: `Synced ${totalOps} notes`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error("Sync error:", message);
    onProgress?.({
      status: "error",
      current: 0,
      total: 0,
      message,
    });
  }
}

/**
 * Push a single note to Supabase (debounced background sync).
 */
export async function pushNote(
  note: LocalNote,
  userId: string
): Promise<void> {
  try {
    const row = localToDb(note, userId);
    const { error } = await supabase
      .from("notes")
      .upsert(row, { onConflict: "id" });

    if (error) {
      console.error("Push note error:", error.message);
      return;
    }

    await db.notes.update(note.id, { syncedAt: Date.now() });
  } catch (err) {
    console.error("Push note failed:", err);
  }
}

/**
 * Delete a note from Supabase.
 */
export async function deleteRemoteNote(noteId: string): Promise<void> {
  try {
    const { error } = await supabase.from("notes").delete().eq("id", noteId);
    if (error) console.error("Delete remote note error:", error.message);
  } catch (err) {
    console.error("Delete remote note failed:", err);
  }
}
