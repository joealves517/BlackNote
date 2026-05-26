/**
 * Sync Engine — Bi-directional sync between local IndexedDB and AWS DynamoDB.
 *
 * All cloud operations go through the Backend API (which talks to DynamoDB).
 * Strategy: last-write-wins by updatedAt timestamp.
 */

import { db, type LocalNote, type WebClip } from "@/lib/local-db";
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
  mediaTranscripts?: string;
  isPinned?: boolean;
  createdAt: string;
  updatedAt: string;
  color?: string;
  tags?: string[];
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
    mediaTranscripts: remote.mediaTranscripts || "{}",
    isPinned: remote.isPinned ?? false,
    color: remote.color,
    tags: remote.tags || [],
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
    mediaTranscripts: note.mediaTranscripts,
    isPinned: note.isPinned,
    createdAt: new Date(note.createdAt).toISOString(),
    updatedAt: new Date(note.updatedAt).toISOString(),
    color: note.color,
    tags: note.tags,
  };
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
    report({ message: "Uploading pending web clips..." });
    await uploadPendingWebClips(userId);

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
    const toDeleteLocally: string[] = [];

    // Check all local notes
    for (const local of localNotes) {
      const remote = remoteMap.get(local.id);
      if (!remote) {
        if (local.syncedAt !== null) {
          // Already synced in the past but no longer on cloud -> deleted on cloud or other device
          toDeleteLocally.push(local.id);
        } else {
          // New offline note -> push to cloud
          toPushToCloud.push(local);
        }
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

    const totalOps = toPushToCloud.length + toPullToLocal.length + toDeleteLocally.length;

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

      const remoteNotes = toPushToCloud.map(localToRemote);
      const pushRes = await fetch(`${AI_API_BASE}/api/notes/sync`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ notes: remoteNotes }),
      });

      if (!pushRes.ok) {
        console.error("[Sync] Push failed:", pushRes.status);
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

    // Step 6: Delete notes locally that were deleted on cloud
    if (toDeleteLocally.length > 0) {
      report({
        current: completed,
        total: totalOps,
        message: `Cleaning up ${toDeleteLocally.length} deleted notes...`,
      });

      for (const id of toDeleteLocally) {
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
            console.warn("Failed to parse note content for media cleanup in sync", err);
          }
        }
        await db.notes.delete(id);
        completed++;
        report({
          current: completed,
          total: totalOps,
          message: `Syncing ${completed}/${totalOps}...`,
        });
      }
    }

    report({ message: "Downloading missing web clips..." });
    await downloadMissingWebClips();

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
    const res = await fetch(`${AI_API_BASE}/api/notes/sync`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ notes: [remote] }),
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

/**
 * Upload pending local Web Clips to AWS S3 and update note content with s3Urls.
 */
export async function uploadPendingWebClips(userEmail: string): Promise<void> {
  try {
    // Find all web clips that don't have an s3Url yet
    const pendingClips = await db.web_clips.filter(clip => !clip.s3Url).toArray();
    if (pendingClips.length === 0) return;

    console.log(`[Sync] Found ${pendingClips.length} pending web clips to upload.`);

    for (const clip of pendingClips) {
      try {
        console.log(`[Sync] Requesting presigned URL for webclip: ${clip.id}`);
        const headers = await authHeaders();
        const presignRes = await fetch(`${AI_API_BASE}/api/upload/presign`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            fileName: `webclip-${clip.id}.html`,
            contentType: "text/html",
          }),
        });

        if (!presignRes.ok) {
          throw new Error(`Presign failed: ${presignRes.status}`);
        }

        const { uploadUrl, publicUrl } = await presignRes.json() as { uploadUrl: string; publicUrl: string };

        console.log(`[Sync] Uploading webclip ${clip.id} to S3...`);
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "text/html",
          },
          body: clip.htmlBlob,
        });

        if (!uploadRes.ok) {
          throw new Error(`S3 upload failed: ${uploadRes.status}`);
        }

        console.log(`[Sync] Upload successful. Public URL: ${publicUrl}`);

        // Update local web clip record
        await db.web_clips.update(clip.id, {
          s3Url: publicUrl,
          syncedAt: Date.now(),
        });

        // Find and update the corresponding note
        const note = await db.notes.get(clip.noteId);
        if (note && note.content) {
          const doc = JSON.parse(note.content);
          
          // Recursively search and inject s3Url in doc
          let updated = false;
          const traverse = (node: any) => {
            if (node.type === "webClipNode" && node.attrs && node.attrs.clipId === clip.id) {
              node.attrs.s3Url = publicUrl;
              updated = true;
            }
            if (node.content && Array.isArray(node.content)) {
              for (const child of node.content) {
                traverse(child);
              }
            }
          };
          traverse(doc);

          if (updated) {
            console.log(`[Sync] Updated note ${note.id} content with s3Url for webclip.`);
            await db.notes.update(note.id, {
              content: JSON.stringify(doc),
              updatedAt: Date.now(), // Force note update
              syncedAt: null, // Force push in next cycle
            });
          }
        }
      } catch (err) {
        console.error(`[Sync] Failed to sync webclip ${clip.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[Sync] Error in uploadPendingWebClips:", err);
  }
}

/**
 * Scan local notes for webClipNodes with s3Urls and download missing HTML snapshots.
 */
export async function downloadMissingWebClips(): Promise<void> {
  try {
    const localNotes = await db.notes.toArray();
    for (const note of localNotes) {
      if (!note.content) continue;
      try {
        const doc = JSON.parse(note.content);
        
        // Find all webClipNodes with s3Url in the doc
        const clipsInNote: Array<{ clipId: string; title: string; url: string; s3Url: string; createdAt: number }> = [];
        const traverse = (node: any) => {
          if (node.type === "webClipNode" && node.attrs && node.attrs.clipId && node.attrs.s3Url) {
            clipsInNote.push({
              clipId: node.attrs.clipId,
              title: node.attrs.title || "",
              url: node.attrs.url || "",
              s3Url: node.attrs.s3Url,
              createdAt: node.attrs.createdAt || Date.now(),
            });
          }
          if (node.content && Array.isArray(node.content)) {
            for (const child of node.content) {
              traverse(child);
            }
          }
        };
        traverse(doc);

        for (const c of clipsInNote) {
          const existing = await db.web_clips.get(c.clipId);
          if (!existing) {
            try {
              console.log(`[Sync] Downloading missing webclip ${c.clipId} from S3...`);
              const res = await fetch(c.s3Url);
              if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);

              const htmlText = await res.text();
              const htmlBlob = new Blob([htmlText], { type: "text/html" });

              await db.web_clips.add({
                id: c.clipId,
                noteId: note.id,
                title: c.title,
                url: c.url,
                htmlBlob,
                createdAt: c.createdAt,
                s3Url: c.s3Url,
                syncedAt: Date.now(),
              });
              console.log(`[Sync] Downloaded and saved webclip ${c.clipId} to IndexedDB.`);
            } catch (downloadErr) {
              console.error(`[Sync] Failed to download webclip ${c.clipId}:`, downloadErr);
            }
          }
        }
      } catch (err) {
        // Ignore JSON parsing errors for simple notes
      }
    }
  } catch (err) {
    console.error("[Sync] Error in downloadMissingWebClips:", err);
  }
}
