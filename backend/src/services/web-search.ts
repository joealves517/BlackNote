import { config } from "../config/index.js";

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

/**
 * Clean HTML entities and tags from a string.
 */
function cleanText(text: string): string {
  if (!text) return "";
  return text
    .replace(/<[^>]+>/g, "") // Remove HTML tags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Search the web using DuckDuckGo HTML crawler.
 * Completely zero-key, zero-cost, and robust.
 */
export async function searchWeb(query: string): Promise<SearchResult[]> {
  try {
    console.log(`[Web Search] Query: ${query}`);
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cache-Control": "max-age=0"
      }
    });

    if (!response.ok) {
      console.error(`[Web Search] DuckDuckGo returned status ${response.status}`);
      return [];
    }

    const html = await response.text();
    const results: SearchResult[] = [];

    // Split HTML by duckduckgo result block marker
    const resultBlocks = html.split('class="result ');
    
    // Skip the first block as it's the header HTML
    for (let i = 1; i < resultBlocks.length && results.length < 5; i++) {
      const block = resultBlocks[i];

      // 1. Extract Link
      const hrefMatch = block.match(/href="([^"]+)"/);
      if (!hrefMatch) continue;
      let link = hrefMatch[1];

      // Ignore ad and internal redirect links
      if (link.startsWith('//') || link.includes('duckduckgo.com/y.js')) continue;
      if (link.startsWith('/')) {
        link = 'https://duckduckgo.com' + link;
      }

      // Parse DuckDuckGo redirect link if present (uddg parameter contains the target URL)
      if (link.includes('uddg=')) {
        const uddgMatch = link.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          try {
            link = decodeURIComponent(uddgMatch[1]);
          } catch {
            // Keep original link if decoding fails
          }
        }
      }

      // 2. Extract Title
      const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
      const title = titleMatch ? cleanText(titleMatch[1]) : "Untitled Source";

      // 3. Extract Snippet
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      const snippet = snippetMatch ? cleanText(snippetMatch[1]) : "";

      if (link && title) {
        results.push({ title, link, snippet });
      }
    }

    console.log(`[Web Search] Found ${results.length} results`);
    return results;
  } catch (err) {
    console.error("[Web Search] Error:", err);
    return [];
  }
}
