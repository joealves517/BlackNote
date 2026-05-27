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

  // Images — strip badges, keep meaningful images
  td.addRule("cleanImages", {
    filter: "img",
    replacement: (_content, node) => {
      const el = node as HTMLImageElement;
      const src = el.getAttribute("src") || "";
      const alt = el.getAttribute("alt") || "";

      // Strip badge/icon images entirely
      if (isBadgeImage(src)) return "";

      // Strip very long base64 data URIs to keep document size reasonable
      if (src.startsWith("data:")) return "";

      // Keep the actual markdown image tag!
      return src ? `\n![${alt}](${src})\n` : "";
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
 * Manually convert relative URLs to absolute URLs.
 * This avoids the CSP "base-uri" violations caused by injecting a <base> tag.
 */
function fixRelativeUris(doc: Document, baseUri: string): void {
  try {
    const baseUrl = new URL(baseUri);
    
    // Fix links
    doc.querySelectorAll("a[href]").forEach((el) => {
      const href = el.getAttribute("href");
      if (href && !href.startsWith("http") && !href.startsWith("data:") && !href.startsWith("#")) {
        try {
          el.setAttribute("href", new URL(href, baseUrl).href);
        } catch (e) { /* ignore invalid urls */ }
      }
    });

    // Fix images
    doc.querySelectorAll("img[src]").forEach((el) => {
      const src = el.getAttribute("src");
      if (src && !src.startsWith("http") && !src.startsWith("data:")) {
        try {
          el.setAttribute("src", new URL(src, baseUrl).href);
        } catch (e) { /* ignore invalid urls */ }
      }
    });
  } catch (e) {
    console.warn("Invalid base URI provided for URL resolution", e);
  }
}

/**
 * Extract main content from a page and convert to Markdown.
 *
 * When called with html string: parses it into a DOM (for non-content-script contexts).
 * When called without html (null): clones the live document directly.
 * The live clone approach captures dynamically-rendered SPA content that
 * outerHTML snapshots would miss (this was the key advantage of the old extension).
 */
export function extractPageContent(
  html: string | null,
  url: string
): PageContent | null {
  let doc: Document;

  if (html) {
    // Non-live context: parse HTML string
    const parser = new DOMParser();
    doc = parser.parseFromString(html, "text/html");
  } else {
    // Live content script: clone the actual DOM tree
    // This captures all JS-rendered content (React, Angular, Vue, etc.)
    doc = document.cloneNode(true) as Document;
  }

  // Instead of injecting a <base> tag which triggers CSP "base-uri 'none'" violations,
  // we manually resolve relative URLs so Readability doesn't discard important nodes.
  fixRelativeUris(doc, url);

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
