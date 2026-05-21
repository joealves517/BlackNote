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
  color?: string;
  tags?: string[];
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

