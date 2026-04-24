/**
 * Convert AI-generated Markdown → ProseMirror JSON
 * Uses TipTap's generateJSON with proper extensions for reliable parsing.
 */

import { generateJSON } from "@tiptap/core";
import {
  StarterKit, TiptapLink, HorizontalRule, TaskList, TaskItem, UpdatedImage,
} from "novel";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { marked } from "marked";

/** Minimal extension set matching NoteEditor's schema */
const parserExtensions = [
  StarterKit.configure({ horizontalRule: false }),
  HorizontalRule,
  TiptapLink.configure({ openOnClick: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
  UpdatedImage,
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
];

/**
 * Convert markdown string to ProseMirror JSON content.
 * Returns a stringified JSON ready for storage.
 */
export function markdownToProsemirror(md: string): string {
  try {
    const html = marked.parse(md) as string;
    const json = generateJSON(html, parserExtensions);
    return JSON.stringify(json);
  } catch (err) {
    console.error("Failed to parse markdown", err);
    // Fallback to basic text if parsing fails entirely
    const fallback = generateJSON(`<p>${md}</p>`, parserExtensions);
    return JSON.stringify(fallback);
  }
}
