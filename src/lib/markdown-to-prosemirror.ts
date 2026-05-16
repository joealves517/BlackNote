/**
 * Convert AI-generated Markdown → ProseMirror JSON
 * Uses TipTap's generateJSON with proper extensions for reliable parsing.
 */

import { generateJSON } from "@tiptap/core";
import {
  StarterKit, TiptapLink, HorizontalRule, TaskList, TaskItem, UpdatedImage, TextStyle, Color
} from "novel";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { TiptapUnderline } from "novel";
import { marked } from "marked";
import { AudioNode } from "@/extensions/AudioNode";
import { VideoNode } from "@/extensions/VideoNode";

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
  AudioNode,
  VideoNode,
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  TiptapUnderline,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
];

/**
 * Convert markdown string to ProseMirror JSON content.
 * Returns a stringified JSON ready for storage.
 */
export function markdownToProsemirror(md: string): string {
  try {
    // breaks: true ensures single newlines become <br> instead of being ignored
    // gfm: true is standard for GitHub Flavored Markdown (tables, etc.)
    // We manually replace ==text== with <mark>text</mark> for reliable highlight support
    const processedMd = md.replace(/==([^=]+)==/g, '<mark>$1</mark>');
    const html = marked.parse(processedMd, { breaks: true, gfm: true, silent: false }) as string;
    const json = generateJSON(html, parserExtensions);
    return JSON.stringify(json);
  } catch (err) {
    console.error("Failed to parse markdown", err);
    // Fallback: retain newlines by converting them to <br> so it doesn't become a single block of text
    const fallbackHtml = md.replace(/\n/g, "<br>");
    const fallback = generateJSON(`<p>${fallbackHtml}</p>`, parserExtensions);
    return JSON.stringify(fallback);
  }
}
