/**
 * Convert AI-generated Markdown → ProseMirror JSON
 * Uses TipTap's generateJSON with proper extensions for reliable parsing.
 */

import { generateJSON } from "@tiptap/core";
import {
  StarterKit, TiptapLink, HorizontalRule, TaskList, TaskItem, UpdatedImage,
} from "novel";

/** Minimal extension set matching NoteEditor's schema */
const parserExtensions = [
  StarterKit.configure({ horizontalRule: false }),
  HorizontalRule,
  TiptapLink.configure({ openOnClick: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
  UpdatedImage,
];

/** Convert inline markdown to HTML */
function inlineToHtml(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

/** Escape HTML special chars inside code blocks */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Detect indentation level of a list item line */
function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? Math.floor(match[1].length / 2) : 0;
}

/** Parse nested list lines into HTML recursively */
function parseListBlock(
  lines: string[],
  startIdx: number,
  baseIndent: number,
  ordered: boolean
): { html: string; endIdx: number } {
  const tag = ordered ? "ol" : "ul";
  let html = `<${tag}>`;
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    const isListItem = ordered
      ? /^\s*\d+\.\s+/.test(line)
      : /^\s*[-*]\s+/.test(line);

    if (!isListItem) break;

    const indent = getIndentLevel(line);
    if (indent < baseIndent) break;

    if (indent === baseIndent) {
      const itemText = ordered
        ? line.replace(/^\s*\d+\.\s+/, "")
        : line.replace(/^\s*[-*]\s+/, "");

      html += `<li><p>${inlineToHtml(itemText)}</p>`;
      i++;

      // Check if next lines are deeper indented → nested list
      if (i < lines.length) {
        const nextLine = lines[i];
        const nextIsItem = /^\s*[-*]\s+/.test(nextLine) || /^\s*\d+\.\s+/.test(nextLine);
        if (nextIsItem && getIndentLevel(nextLine) > baseIndent) {
          const nextOrdered = /^\s*\d+\.\s+/.test(nextLine);
          const nested = parseListBlock(lines, i, getIndentLevel(nextLine), nextOrdered);
          html += nested.html;
          i = nested.endIdx;
        }
      }

      html += "</li>";
    } else {
      // Deeper indent without a parent — shouldn't happen, but handle gracefully
      break;
    }
  }

  html += `</${tag}>`;
  return { html, endIdx: i };
}

/** Convert markdown string to HTML */
function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(escapeHtml(lines[i]));
        i++;
      }
      i++;
      out.push(
        `<pre><code${lang ? ` class="language-${lang}"` : ""}>${code.join("\n")}</code></pre>`
      );
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      out.push(`<h${h[1].length}>${inlineToHtml(h[2])}</h${h[1].length}>`);
      i++;
      continue;
    }

    // HR
    if (/^---+$/.test(line.trim())) { out.push("<hr>"); i++; continue; }

    // Blockquote
    if (line.startsWith("> ")) {
      out.push(`<blockquote><p>${inlineToHtml(line.slice(2))}</p></blockquote>`);
      i++;
      continue;
    }

    // Bullet list (with nesting support)
    if (/^\s*[-*]\s+/.test(line)) {
      const indent = getIndentLevel(line);
      const result = parseListBlock(lines, i, indent, false);
      out.push(result.html);
      i = result.endIdx;
      continue;
    }

    // Numbered list (with nesting support)
    if (/^\s*\d+\.\s+/.test(line)) {
      const indent = getIndentLevel(line);
      const result = parseListBlock(lines, i, indent, true);
      out.push(result.html);
      i = result.endIdx;
      continue;
    }

    // Standalone image
    const img = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) { out.push(`<img src="${img[2]}" alt="${img[1]}">`); i++; continue; }

    // Empty line — skip
    if (line.trim() === "") { i++; continue; }

    // Paragraph
    out.push(`<p>${inlineToHtml(line)}</p>`);
    i++;
  }

  return out.join("\n");
}

/**
 * Convert markdown string to ProseMirror JSON content.
 * Returns a stringified JSON ready for storage.
 */
export function markdownToProsemirror(md: string): string {
  const html = markdownToHtml(md);
  const json = generateJSON(html, parserExtensions);
  return JSON.stringify(json);
}
