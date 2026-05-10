/**
 * Notes Database Service — AWS DynamoDB operations for user notes.
 * Handles CRUD and one-time migration from Supabase PostgreSQL.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { config } from "../config/index.js";

// ─── DynamoDB Client ────────────────────────────────────────────────

const rawClient = new DynamoDBClient({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

const ddb = DynamoDBDocumentClient.from(rawClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE = config.aws.dynamoTableName;

// ─── Types ──────────────────────────────────────────────────────────

export interface DynamoNote {
  UserId: string;
  NoteId: string;
  title: string;
  content: string; // JSON string of ProseMirror doc
  chatHistory?: string; // JSON string of chat messages
  isPinned?: boolean;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

// ─── CRUD Operations ────────────────────────────────────────────────

export async function getAllNotes(userEmail: string): Promise<DynamoNote[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "UserId = :uid",
      ExpressionAttributeValues: { ":uid": userEmail },
    })
  );
  return (result.Items as DynamoNote[]) || [];
}

export async function putNote(
  userEmail: string,
  note: Omit<DynamoNote, "UserId">
): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: { UserId: userEmail, ...note },
    })
  );
}

export async function deleteNote(
  userEmail: string,
  noteId: string
): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { UserId: userEmail, NoteId: noteId },
    })
  );
}

/**
 * Batch upsert notes. DynamoDB BatchWrite has a 25-item limit per call.
 */
export async function batchPutNotes(
  userEmail: string,
  notes: Omit<DynamoNote, "UserId">[]
): Promise<void> {
  const chunks: Omit<DynamoNote, "UserId">[][] = [];
  for (let i = 0; i < notes.length; i += 25) {
    chunks.push(notes.slice(i, i + 25));
  }

  for (const chunk of chunks) {
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE]: chunk.map((note) => ({
            PutRequest: {
              Item: { UserId: userEmail, ...note },
            },
          })),
        },
      })
    );
  }
}

// ─── Supabase Migration ─────────────────────────────────────────────

/**
 * One-time migration: pull all notes from Supabase for a given email
 * and write them into DynamoDB. Uses Supabase Service Role Key to
 * bypass RLS and query across auth.users + public.notes.
 */
export async function migrateNotesFromSupabase(
  userEmail: string
): Promise<{ migrated: number }> {
  const serviceKey = config.supabase.serviceRoleKey;
  const baseUrl = config.supabase.url;

  if (!serviceKey) {
    console.warn("[Migration] No SUPABASE_SERVICE_ROLE_KEY configured, skipping.");
    return { migrated: 0 };
  }

  // Step 1: Find the Supabase user ID by email
  const usersRes = await fetch(
    `${baseUrl}/auth/v1/admin/users?page=1&per_page=50`,
    {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    }
  );

  if (!usersRes.ok) {
    console.error("[Migration] Failed to fetch Supabase users:", usersRes.status);
    return { migrated: 0 };
  }

  const usersData = await usersRes.json() as any;
  const users = usersData.users || usersData;
  const matchedUser = Array.isArray(users)
    ? users.find((u: any) => u.email === userEmail)
    : null;

  if (!matchedUser) {
    // No Supabase account for this email — nothing to migrate
    return { migrated: 0 };
  }

  const supabaseUserId = matchedUser.id;

  // Step 2: Fetch all notes for this user via PostgREST
  const notesRes = await fetch(
    `${baseUrl}/rest/v1/notes?user_id=eq.${supabaseUserId}&select=*`,
    {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
    }
  );

  if (!notesRes.ok) {
    console.error("[Migration] Failed to fetch notes:", notesRes.status);
    return { migrated: 0 };
  }

  const notes = (await notesRes.json()) as any[];
  if (notes.length === 0) return { migrated: 0 };

  // Step 3: Transform and write to DynamoDB
  const dynamoNotes: Omit<DynamoNote, "UserId">[] = notes.map((note) => {
    // Supabase stores content as JSONB — extract chatHistory and isPinned
    let contentObj = note.content;
    let chatHistory: string | undefined;
    let isPinned = false;

    if (contentObj && typeof contentObj === "object" && !Array.isArray(contentObj)) {
      const { _chatHistory, _isPinned, ...rest } = contentObj;
      if (_chatHistory) chatHistory = JSON.stringify(_chatHistory);
      if (_isPinned) isPinned = Boolean(_isPinned);
      contentObj = rest;
    }

    return {
      NoteId: note.id,
      title: note.title || "Untitled",
      content: JSON.stringify(contentObj),
      chatHistory,
      isPinned,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
    };
  });

  await batchPutNotes(userEmail, dynamoNotes);
  console.log(`[Migration] Migrated ${dynamoNotes.length} notes for ${userEmail}`);
  return { migrated: dynamoNotes.length };
}
