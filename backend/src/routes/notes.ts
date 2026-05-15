/**
 * Notes API Routes — DynamoDB-backed CRUD for user notes.
 * Includes one-time lazy migration from Supabase.
 */

import { Router, Request, Response } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.js";
import {
  getAllNotes,
  putNote,
  deleteNote,
  batchPutNotes,
  type DynamoNote,
} from "../services/notes-db.js";
import {
  getUserByEmail,
} from "../services/firestore.js";

const router = Router();

/**
 * GET /api/notes
 * Fetch all notes for the authenticated user.
 */
router.get(
  "/",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { userEmail } = req as AuthenticatedRequest;

    try {
      const notes = await getAllNotes(userEmail);
      res.json({ notes });
    } catch (err) {
      console.error("[Notes] Failed to fetch:", err);
      res.status(500).json({ error: "fetch_failed" });
    }
  }
);

/**
 * POST /api/notes/sync
 * Batch upsert notes from the client.
 * Body: { notes: Array<{ NoteId, title, content, chatHistory?, isPinned?, createdAt, updatedAt }> }
 */
router.post(
  "/sync",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { userEmail } = req as AuthenticatedRequest;
    const { notes } = req.body as { notes: Omit<DynamoNote, "UserId">[] };

    if (!Array.isArray(notes) || notes.length === 0) {
      res.status(400).json({ error: "invalid_notes" });
      return;
    }

    try {
      await batchPutNotes(userEmail, notes);
      res.json({ synced: notes.length });
    } catch (err) {
      console.error("[Notes] Sync failed:", err);
      res.status(500).json({ error: "sync_failed" });
    }
  }
);

/**
 * DELETE /api/notes/:id
 * Delete a single note.
 */
router.delete(
  "/:id",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { userEmail } = req as AuthenticatedRequest;
    const noteId = req.params.id as string;

    try {
      await deleteNote(userEmail, noteId);
      res.json({ deleted: true });
    } catch (err) {
      console.error("[Notes] Delete failed:", err);
      res.status(500).json({ error: "delete_failed" });
    }
  }
);


export default router;
