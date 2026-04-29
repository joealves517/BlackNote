/**
 * YouTube Transcript Extractor for BlackNote Web Clipper.
 *
 * Multi-strategy transcript extraction ported from Spark AI.
 * Content Scripts run in ISOLATED WORLD — cannot access YouTube's
 * JS globals. We use these strategies in order:
 *
 *  1. InnerTube API (ANDROID client) — most reliable
 *  2. Fetch video page HTML → extract captionTracks → fetch XML
 *  3. Read transcript segments from DOM (panel may be open)
 *  4. Open transcript panel programmatically and read it
 */

// InnerTube API constants — uses ANDROID client to bypass web restrictions
const INNERTUBE_API_URL =
  "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const INNERTUBE_CLIENT_VERSION = "20.10.38";
const INNERTUBE_CONTEXT = {
  client: {
    clientName: "ANDROID",
    clientVersion: INNERTUBE_CLIENT_VERSION,
  },
};

export function getVideoId(): string | null {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("v");
  } catch {
    return null;
  }
}

export function getVideoTitle(): string {
  const el =
    document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
    document.querySelector("#title h1") ||
    document.querySelector("h1.title");
  return el?.textContent?.trim() || document.title;
}

export function isYouTubePage(): boolean {
  return (
    window.location.hostname.includes("youtube.com") && !!getVideoId()
  );
}

/**
 * Main entry — tries all strategies and returns the best transcript.
 */
export async function extractTranscript(): Promise<string | null> {
  const videoId = getVideoId();
  if (!videoId) return null;

  // Strategy 1: InnerTube API
  try {
    const transcript = await extractViaInnerTube(videoId);
    if (transcript && transcript.length > 50) return transcript;
  } catch (err) {
    console.warn("[BlackNote] InnerTube strategy failed:", err);
  }

  // Strategy 2: Fetch page HTML → parse caption tracks
  try {
    const transcript = await extractViaFetch(videoId);
    if (transcript && transcript.length > 50) return transcript;
  } catch (err) {
    console.warn("[BlackNote] Fetch strategy failed:", err);
  }

  // Strategy 3: Read from DOM (transcript panel might be open)
  try {
    const transcript = readTranscriptFromDOM();
    if (transcript && transcript.length > 50) return transcript;
  } catch (err) {
    console.warn("[BlackNote] DOM read failed:", err);
  }

  // Strategy 4: Open transcript panel programmatically
  try {
    const transcript = await openAndReadTranscriptPanel();
    if (transcript && transcript.length > 50) return transcript;
  } catch (err) {
    console.warn("[BlackNote] Panel open failed:", err);
  }

  return null;
}

// ─── Strategy 1: InnerTube API ────────────────────────
async function extractViaInnerTube(
  videoId: string
): Promise<string | null> {
  const resp = await fetch(INNERTUBE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      context: INNERTUBE_CONTEXT,
      videoId,
    }),
  });

  if (!resp.ok) return null;
  const data = await resp.json();
  const tracks =
    data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!Array.isArray(tracks) || tracks.length === 0) return null;
  return fetchCaptionTrack(tracks);
}

// ─── Strategy 2: Fetch page HTML ──────────────────────
async function extractViaFetch(
  videoId: string
): Promise<string | null> {
  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const res = await fetch(pageUrl, {
    headers: { "Accept-Language": "en-US,en;q=0.9" },
  });
  const html = await res.text();

  // Targeted extraction: find just the captionTracks array
  const captionTracksMatch = html.match(
    /"captionTracks"\s*:\s*(\[[\s\S]*?\])\s*,\s*"/
  );
  if (captionTracksMatch) {
    try {
      const tracks = JSON.parse(captionTracksMatch[1]);
      return await fetchCaptionTrack(tracks);
    } catch {
      // JSON parse failed — try alternative
    }
  }

  // Alternative: find baseUrl directly from the HTML
  const baseUrlMatch = html.match(
    /"baseUrl"\s*:\s*"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]+)"/
  );
  if (baseUrlMatch) {
    try {
      const url = baseUrlMatch[1].replace(/\\u0026/g, "&");
      const captionRes = await fetch(url);
      const xml = await captionRes.text();
      return parseTranscriptXML(xml);
    } catch {
      // Fallback
    }
  }

  return null;
}

// ─── Strategy 3: Read from DOM ────────────────────────
function readTranscriptFromDOM(): string | null {
  const selectors = [
    "ytd-transcript-segment-renderer .segment-text",
    "ytd-transcript-segment-renderer yt-formatted-string",
    "ytd-transcript-segment-renderer .ytd-transcript-segment-renderer",
    "[target-id='engagement-panel-searchable-transcript'] .segment-text",
    "[target-id='engagement-panel-searchable-transcript'] yt-formatted-string.segment-text",
    ".ytd-transcript-segment-list-renderer .segment-text",
  ];

  for (const selector of selectors) {
    const segments = document.querySelectorAll(selector);
    if (segments.length > 0) {
      const text = Array.from(segments)
        .map((s) => s.textContent?.trim() || "")
        .filter(Boolean)
        .join(" ");
      if (text.length > 50) return text;
    }
  }

  return null;
}

// ─── Strategy 4: Open transcript panel ────────────────
async function openAndReadTranscriptPanel(): Promise<string | null> {
  const showBtnSelectors = [
    "ytd-video-description-transcript-section-renderer button",
    'button[aria-label*="transcript" i]',
    'button[aria-label*="Transcript" i]',
    "#description ytd-video-description-transcript-section-renderer #button",
  ];

  let showBtn: HTMLElement | null = null;
  for (const sel of showBtnSelectors) {
    showBtn = document.querySelector(sel) as HTMLElement | null;
    if (showBtn) break;
  }

  if (!showBtn) return null;
  showBtn.click();

  // Wait for transcript panel to render
  await new Promise((r) => setTimeout(r, 2500));
  const text = readTranscriptFromDOM();

  // Close the transcript panel to clean up
  const closeSelectors = [
    '[target-id="engagement-panel-searchable-transcript"] #visibility-button button',
    "ytd-engagement-panel-title-header-renderer #visibility-button button",
  ];
  for (const sel of closeSelectors) {
    const closeBtn = document.querySelector(sel) as HTMLElement | null;
    if (closeBtn) {
      closeBtn.click();
      break;
    }
  }

  return text;
}

// ─── Shared Helpers ───────────────────────────────────

/**
 * Pick the best caption track and fetch its content.
 * Priority: manual English > any English > auto-generated > first
 */
async function fetchCaptionTrack(
  tracks: any[]
): Promise<string | null> {
  if (!tracks || tracks.length === 0) return null;

  const track =
    tracks.find(
      (t: any) => t.languageCode === "en" && t.kind !== "asr"
    ) ||
    tracks.find((t: any) => t.languageCode === "en") ||
    tracks.find((t: any) => t.kind === "asr") ||
    tracks[0];

  if (!track?.baseUrl) return null;

  const url = track.baseUrl.replace(/\\u0026/g, "&");
  const captionRes = await fetch(url);
  const xml = await captionRes.text();
  return parseTranscriptXML(xml);
}

/**
 * Parse caption XML (both <text> classic and <p> srv3 formats).
 */
function parseTranscriptXML(xml: string): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");

  const lines: string[] = [];

  // Format 1: <text> (classic format)
  const textNodes = doc.querySelectorAll("text");
  if (textNodes.length > 0) {
    textNodes.forEach((node) => {
      const text = node.textContent || "";
      if (text.trim()) lines.push(text.trim());
    });
  } else {
    // Format 2: <p> (srv3 format, common with InnerTube)
    const pNodes = doc.querySelectorAll("p");
    if (pNodes.length > 0) {
      pNodes.forEach((node) => {
        const text = node.textContent || "";
        if (text.trim()) lines.push(text.trim());
      });
    }
  }

  if (lines.length === 0) return null;

  const result = lines
    .join(" ")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return result.length > 0 ? result : null;
}
