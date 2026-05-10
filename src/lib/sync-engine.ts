/**
 * Sync Engine — Bi-directional sync between local IndexedDB and AWS DynamoDB.
 *
 * All cloud operations go through the Backend API (which talks to DynamoDB).
 * Strategy: last-write-wins by updatedAt timestamp.
 */

import { db, type LocalNote } from "@/lib/local-db";
import { getAuthToken, getCurrentUser } from "@/lib/auth-client";
import { AI_API_BASE } from "@/lib/constants";

export interface SyncProgress {
  status: "idle" | "syncing" | "done" | "error";
  current: number;
  total: number;
  message: string;
}

type ProgressCallback = (progress: SyncProgress) => void;

// ─── API Helpers ────────────────────────────────────────────────────

interface RemoteNote {
  NoteId: string;
  title: string;
  content: string;
  chatHistory?: string;
  isPinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

function remoteToLocal(remote: RemoteNote): LocalNote {
  return {
    id: remote.NoteId,
    title: remote.title,
    content: remote.content,
    createdAt: new Date(remote.createdAt).getTime(),
    updatedAt: new Date(remote.updatedAt).getTime(),
    syncedAt: Date.now(),
    chatHistory: remote.chatHistory || "[]",
    isPinned: remote.isPinned ?? false,
  };
}

function localToRemote(note: LocalNote): RemoteNote {
  // Embed chatHistory and isPinned into content for cloud storage
  let parsedContent: any = {};
  try {
    parsedContent = JSON.parse(note.content);
  } catch {
    parsedContent = { type: "doc", content: [] };
  }

  return {
    NoteId: note.id,
    title: note.title,
    content: note.content,
    chatHistory: note.chatHistory,
    isPinned: note.isPinned,
    createdAt: new Date(note.createdAt).toISOString(),
    updatedAt: new Date(note.updatedAt).toISOString(),
  };
}

// ─── Migration ──────────────────────────────────────────────────────

/**
 * Trigger one-time lazy migration from Supabase to DynamoDB.
 * Called on first login with the new extension version.
 */
async function triggerMigration(): Promise<void> {
  try {
    const headers = await authHeaders();
    const res = await fetch(`${AI_API_BASE}/api/notes/migrate`, {
      method: "POST",
      headers,
    });
    if (res.ok) {
      const data = await res.json();
      console.log("[Sync] Migration result:", data);
    }
  } catch (err) {
    console.warn("[Sync] Migration request failed (will retry):", err);
  }
}

// ─── Full Sync ──────────────────────────────────────────────────────

/**
 * Full sync: merge local IndexedDB ↔ DynamoDB via Backend.
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
    // Step 0: Trigger lazy migration (idempotent, fast if already done)
    const migrationDone = localStorage.getItem("blacknote_migrated");
    if (!migrationDone) {
      report({ message: "Checking for cloud data..." });
      await triggerMigration();
      localStorage.setItem("blacknote_migrated", "true");
    }

    report({ message: "Fetching cloud data..." });

    // Step 1: Fetch remote notes via Backend
    const headers = await authHeaders();
    const res = await fetch(`${AI_API_BASE}/api/notes`, { headers });

    if (!res.ok) throw new Error(`Failed to fetch notes: ${res.status}`);

    const { notes: remoteRaw } = (await res.json()) as {
      notes: RemoteNote[];
    };
    const remoteNotes = remoteRaw.map(remoteToLocal);
    const localNotes = await db.notes.toArray();

    // Step 2: Build lookup maps
    const remoteMap = new Map(remoteNotes.map((n) => [n.id, n]));
    const localMap = new Map(localNotes.map((n) => [n.id, n]));

    // Step 3: Determine merge actions
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

    // Step 4: Push local → cloud (batch)
    if (toPushToCloud.length > 0) {
      report({
        current: completed,
        total: totalOps,
        message: `Uploading ${toPushToCloud.length} notes...`,
      });

      // Upload notes one by one to support standard REST backends
      for (const note of toPushToCloud) {
        const remoteNote = localToRemote(note);
        try {
          const pushRes = await fetch(`${AI_API_BASE}/api/notes`, {
            method: "POST",
            headers: await authHeaders(),
            body: JSON.stringify(remoteNote),
          });

          if (!pushRes.ok) {
            console.error(`[Sync] Push failed for ${note.id}:`, pushRes.status);
          } else {
            await db.notes.update(note.id, { syncedAt: Date.now() });
          }
        } catch (err) {
          console.error(`[Sync] Push error for ${note.id}:`, err);
        }
        
        completed++;
        report({
          current: completed,
          total: totalOps,
          message: `Syncing ${completed}/${totalOps}...`,
        });
      }
    }

    // Step 5: Pull remote → local
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
 * Push a single note to cloud (debounced background sync).
 */
export async function pushNote(
  note: LocalNote,
  userId: string
): Promise<void> {
  try {
    const remote = localToRemote(note);
    const res = await fetch(`${AI_API_BASE}/api/notes`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(remote),
    });

    if (!res.ok) {
      console.error("Push note error:", res.status);
      return;
    }

    await db.notes.update(note.id, { syncedAt: Date.now() });
  } catch (err) {
    console.error("Push note failed:", err);
  }
}

/**
 * Delete a note from cloud.
 */
export async function deleteRemoteNote(noteId: string): Promise<void> {
  try {
    const res = await fetch(`${AI_API_BASE}/api/notes/${noteId}`, {
      method: "DELETE",
      headers: await authHeaders(),
    });
    if (!res.ok) console.error("Delete remote note error:", res.status);
  } catch (err) {
    console.error("Delete remote note failed:", err);
  }
}
