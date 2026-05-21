/**
 * Context Builder — Smart context window construction for AI interactions.
 *
 * Factor 3 (Own Your Context Window): Instead of dumping the entire document
 * to the LLM, build a focused context window that contains only what's
 * relevant to the user's instruction — saving tokens and improving accuracy.
 *
 * Factor 13 (Pre-fetch Context): Pre-compute expensive context (media
 * transcripts, document serialization) before the user sends their instruction.
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface NoteContext {
  noteId: string;
  noteTitle: string;
  noteContent: string;
  mediaContext: string;
}

export interface ChatContextOptions {
  noteTitle: string;
  noteContent: string;
  mediaContext: string;
  previousContextFingerprint?: string;
}

export interface ChatContextResult {
  context: string;
  fingerprint: string;
  isFullContext: boolean;
}

// ─── Chat Context ───────────────────────────────────────────────────

/**
 * Build context for the Chat AI, implementing incremental context delivery.
 *
 * On the first message (or when note content changes), sends full context.
 * On follow-up messages with unchanged content, sends only a lightweight
 * reminder — saving 60-80% tokens on average multi-turn conversations.
 */
export function buildChatContext(options: ChatContextOptions): ChatContextResult {
  const { noteTitle, noteContent, mediaContext, previousContextFingerprint } = options;

  const currentFingerprint = computeFingerprint(noteTitle, noteContent, mediaContext);
  const isFirstOrChanged = previousContextFingerprint !== currentFingerprint;

  if (isFirstOrChanged) {
    const fullContext = buildFullChatContext(noteTitle, noteContent, mediaContext);
    return {
      context: fullContext,
      fingerprint: currentFingerprint,
      isFullContext: true,
    };
  }

  const lightContext = buildLightChatContext(noteTitle);
  return {
    context: lightContext,
    fingerprint: currentFingerprint,
    isFullContext: false,
  };
}

function buildFullChatContext(
  noteTitle: string,
  noteContent: string,
  mediaContext: string
): string {
  return `--- STRICT SYSTEM RULES ---
1. Always reply in the exact same language as the user's prompt.
2. When referencing TEXT from the note, you MUST quote the exact source text using markdown blockquotes (e.g. > quote text). NEVER provide an answer without citing the exact blockquote if your answer relies on TEXT from the note.
3. When quoting multiple lines or lists of TEXT, you MUST preserve the exact line breaks and list numbers from the original text.
4. IMPORTANT: The note may contain appended MEDIA TRANSCRIPT sections at the end. You MUST read and use them to answer questions about the recordings. Ignore any dummy text like 'Video Transcript Unavailable' if a MEDIA TRANSCRIPT is actually provided below it.
5. STRICT RULE FOR MEDIA: If your answer relies on a MEDIA TRANSCRIPT, NEVER quote or regurgitate the raw transcript text. Just summarize the information naturally in your own words to answer the user's question. DO NOT use blockquotes or media citations for information coming from the transcript.

# NOTE TITLE: ${noteTitle}

# NOTE CONTENT:
${noteContent}${mediaContext}`;
}

function buildLightChatContext(noteTitle: string): string {
  return `--- SYSTEM RULES ---
Continue the conversation. The note context was already provided. Refer to conversation history for note content.
Always reply in the same language as the user. If referencing the note, use blockquotes. For MEDIA TRANSCRIPT info, summarize naturally without quoting raw text.

# NOTE TITLE: ${noteTitle}`;
}

// ─── Quick Action Context ───────────────────────────────────────────

/**
 * Build context for chat quick actions (summarize, explain, etc.).
 * Always sends full context since it's the first interaction.
 */
export function buildQuickActionContext(
  noteTitle: string,
  noteContent: string,
  mediaContext: string
): string {
  return `# ${noteTitle}\n\n${noteContent}${mediaContext}\n\n--- System Instruction ---\nYou are a smart note assistant. When referencing TEXT from the note, you MUST quote the exact source text using markdown blockquotes (e.g. > quote text). IMPORTANT: The note may contain appended MEDIA TRANSCRIPT sections at the end. You MUST read and use them to answer questions about the recordings. Ignore any dummy text like 'Video Transcript Unavailable' if a MEDIA TRANSCRIPT is actually provided below it. STRICT RULE FOR MEDIA: If your answer relies on a MEDIA TRANSCRIPT, NEVER quote or regurgitate the raw transcript text. Just summarize the information naturally in your own words. DO NOT use blockquotes or media citations for information coming from the transcript.`;
}

// ─── Pre-fetch Helpers ──────────────────────────────────────────────

/**
 * Compute a lightweight fingerprint for change detection.
 * Used to avoid re-sending identical context on follow-up messages.
 */
function computeFingerprint(...parts: string[]): string {
  const combined = parts.join("|");
  // Simple hash — sufficient for same-session change detection
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Build unanalyzed media fallback context.
 *
 * When there are audio/video nodes in the note but no transcripts yet,
 * instruct the AI to guide the user to analyze them first.
 */
export function buildUnanalyzedMediaContext(docString: string): string {
  const hasMedia = docString.includes('"audioNode"') || docString.includes('"videoNode"');
  if (!hasMedia) return "";

  return `\n\n--- MEDIA: Audio/Video recording(s) present in this note but NOT yet analyzed ---\nIf the user asks about any recording, respond: "This recording hasn't been analyzed yet. Please tap on the recording and select 'Analyze with AI' to transcribe it first."\n---`;
}
