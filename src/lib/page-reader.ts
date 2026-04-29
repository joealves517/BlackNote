/**
 * Core page reader engine.
 * Uses Mozilla Readability to extract main content from a web page,
 * then Turndown with custom rules (inspired by Jina Reader's markify.ts)
 * to convert clean HTML into note-friendly Markdown.
 */

import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

export interface PageContent {
  title: string;
  markdown: string;
  excerpt: string;
  siteName: string;
  byline: string | null;
  url: string;
  wordCount: number;
  clippedAt: string;
}

/** Domains/patterns for badge or tracking images — always strip */
const BADGE_PATTERNS = [
  "shields.io",
  "badge",
  "travis-ci",
  "codecov.io",
  "img.shields",
  "github.com/.*\\.svg",
  "circleci.com",
  "appveyor.com",
  "coveralls.io",
  "david-dm.org",
  "snyk.io",
];

const BADGE_REGEX = new RegExp(BADGE_PATTERNS.join("|"), "i");

/**
 * Check if an image URL is a small badge/icon that adds no value to notes.
 */
function isBadgeImage(src: string): boolean {
  return BADGE_REGEX.test(src);
}

/**
 * Build a Turndown instance with custom rules optimized for note-taking.
 * Focuses on extracting readable text content, stripping visual noise.
 */
function createTurndownService(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
    strongDelimiter: "**",
    hr: "---",
  });

  // Images — strip badges, keep meaningful images with short alt text only
  td.addRule("cleanImages", {
    filter: "img",
    replacement: (_content, node) => {
      const el = node as HTMLImageElement;
      const src = el.getAttribute("src") || "";
      const alt = el.getAttribute("alt") || "";

      // Strip badge/icon images entirely
      if (isBadgeImage(src)) return "";

      // Strip images with no alt text (decorative)
      if (!alt || alt.length < 3) return "";

      // Strip very long base64 data URIs
      if (src.startsWith("data:")) return "";

      // For meaningful images, keep just the alt text description
      return alt ? `\n_[Image: ${alt}]_\n` : "";
    },
  });

  // Strikethrough
  td.addRule("strikethrough", {
    filter: ["del", "s"],
    replacement: (content) => (content ? `~~${content}~~` : ""),
  });

  // Task list checkboxes
  td.addRule("taskListItem", {
    filter: (node) =>
      node.nodeName === "LI" &&
      node.querySelector('input[type="checkbox"]') !== null,
    replacement: (content, node) => {
      const checkbox = (node as HTMLElement).querySelector("input");
      const checked = checkbox?.checked ? "x" : " ";
      const cleaned = content.replace(/^\s*\[[ x]\]\s*/, "").trim();
      return `- [${checked}] ${cleaned}\n`;
    },
  });

  // Table cells — collapse whitespace for clean single-line cells
  td.addRule("tableCell", {
    filter: ["th", "td"],
    replacement: (content) => ` ${content.replace(/\n/g, " ").trim()} |`,
  });

  // Table rows — add header separator when row contains <th>
  td.addRule("tableRow", {
    filter: "tr",
    replacement: (content, node) => {
      const cells = content.trim();
      let result = `|${cells}\n`;

      const isHeader = (node as HTMLElement).querySelector("th") !== null;
      if (isHeader) {
        const colCount = (node as HTMLElement).children.length;
        const separator = `| ${Array(colCount).fill("---").join(" | ")} |\n`;
        result += separator;
      }

      return result;
    },
  });

  // Figure — keep caption text, strip the image
  td.addRule("figure", {
    filter: "figure",
    replacement: (content) => `\n\n${content.trim()}\n\n`,
  });

  td.addRule("figcaption", {
    filter: "figcaption",
    replacement: (content) => `\n_${content.trim()}_\n`,
  });

  // Tables wrapper — ensure surrounding newlines
  td.addRule("table", {
    filter: "table",
    replacement: (content) => `\n\n${content}\n\n`,
  });

  // Strip noisy elements that Readability might miss
  td.remove([
    "script", "style", "nav", "footer", "iframe", "noscript",
    "svg", "canvas", "video", "audio",
  ] as any);

  return td;
}

/**
 * Aggressive post-processing to clean up the markdown for note-taking.
 */
function postProcess(md: string, title: string): string {
  let cleaned = md
    // Collapse 3+ newlines → 2
    .replace(/\n{3,}/g, "\n\n")
    // Remove lines that are only whitespace
    .replace(/^\s+$/gm, "")
    // Remove empty markdown links [text]()
    .replace(/\[([^\]]*)\]\(\)/g, "$1")
    // Remove raw image markdown that slipped through: ![...](very-long-url)
    .replace(/!\[([^\]]*)\]\([^)]{100,}\)/g, (_, alt) =>
      alt ? `_[Image: ${alt}]_` : ""
    )
    // Remove raw image markdown for short URLs too (badges etc.)
    .replace(/!\[\]\([^)]*\)/g, "")
    // Remove standalone URLs on their own line (tracking/reference noise)
    .replace(/^\s*https?:\/\/\S{80,}\s*$/gm, "")
    // Remove lines that are just repeated dashes or equals (visual separators)
    .replace(/^[=\-]{5,}\s*$/gm, "---")
    // Collapse consecutive horizontal rules
    .replace(/(---\n?){2,}/g, "---\n")
    // Remove duplicate title if it appears at start of content
    .replace(new RegExp(`^#\\s*${escapeRegex(title)}\\s*\\n`, "i"), "")
    .trim();

  return cleaned;
}

/** Escape special regex characters in a string */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pre-clean the HTML before Readability processes it.
 * Removes elements that add noise to the extracted content.
 */
function preCleanDOM(doc: Document): void {
  // Remove elements that are typically navigation, ads, or UI chrome
  const noisySelectors = [
    "[role='banner']",
    "[role='navigation']",
    "[role='complementary']",
    ".sidebar",
    ".advertisement",
    ".ad",
    ".social-share",
    ".share-buttons",
    ".related-posts",
    ".comments",
    ".comment-section",
    "header nav",
    "footer",
  ];

  for (const selector of noisySelectors) {
    doc.querySelectorAll(selector).forEach((el) => el.remove());
  }
}

/**
 * Extract main content from an HTML string and convert to Markdown.
 *
 * @param html - Full HTML of the page (from content script)
 * @param url  - Source URL (for Readability base URI resolution)
 * @returns Parsed page content, or null if Readability cannot extract content
 */
export function extractPageContent(
  html: string,
  url: string
): PageContent | null {
  // Build a DOM from the HTML string so Readability can traverse it
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Readability needs a base URI for resolving relative links
  const base = doc.createElement("base");
  base.href = url;
  doc.head.prepend(base);

  // Pre-clean noise before Readability
  preCleanDOM(doc);

  const reader = new Readability(doc, { charThreshold: 100 });
  const article = reader.parse();

  if (!article?.content) return null;

  const turndown = createTurndownService();
  const rawMarkdown = turndown.turndown(article.content);
  const title = article.title || "Untitled";
  const markdown = postProcess(rawMarkdown, title);

  return {
    title,
    markdown,
    excerpt: article.excerpt || "",
    siteName: article.siteName || new URL(url).hostname,
    byline: article.byline,
    url,
    wordCount: markdown.split(/\s+/).length,
    clippedAt: new Date().toISOString(),
  };
}

/**
 * Truncate Markdown intelligently before sending to AI.
 * Preserves heading structure so AI can understand document outline
 * even when content is cut off.
 */
const MAX_CHARS_FOR_AI = 30_000;

export function prepareForAI(markdown: string): string {
  if (markdown.length <= MAX_CHARS_FOR_AI) return markdown;

  const headings = markdown.match(/^#{1,3}\s.+$/gm) || [];
  const headingMap = headings.join("\n");
  const budget = MAX_CHARS_FOR_AI - headingMap.length - 200;

  return [
    markdown.substring(0, budget),
    "\n\n---\n_[Content truncated for AI processing]_\n",
    "\n**Document structure:**\n",
    headingMap,
  ].join("");
}
