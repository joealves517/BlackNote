/**
 * Smart Triggers — Event-driven note automations.
 *
 * Factor 12 (Triggers): Agentic actions driven by note state changes,
 * not explicit user commands. These run in the background to assist
 * the user proactively.
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface TriggerAction {
  type: "suggest_title" | "suggest_tags" | "suggest_todo";
  payload: Record<string, unknown>;
}

export type TriggerCallback = (action: TriggerAction) => void;

interface TriggerState {
  lastContentLength: number;
  lastTitleCheck: number;
  titleSuggested: boolean;
  contentHashAtLastCheck: number;
}

// ─── Content Heuristics ─────────────────────────────────────────────

const MIN_CONTENT_FOR_TITLE = 120;    // characters before suggesting a title
const TITLE_CHECK_DEBOUNCE_MS = 10000; // minimum time between title checks
const TODO_PATTERN = /\b(todo|to-do|task|action item|cần làm|việc cần|phải làm)\b/i;

/**
 * Simple hash for change detection.
 */
function quickHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < Math.min(str.length, 500); i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// ─── Trigger Engine ─────────────────────────────────────────────────

/**
 * Create a trigger engine that watches for note state changes and
 * emits proactive suggestions.
 *
 * Usage:
 *   const engine = createTriggerEngine((action) => { ... });
 *   // Call on every content change:
 *   engine.evaluate(noteTitle, noteContent);
 *   // Cleanup:
 *   engine.dispose();
 */
export function createTriggerEngine(callback: TriggerCallback) {
  const state: TriggerState = {
    lastContentLength: 0,
    lastTitleCheck: 0,
    titleSuggested: false,
    contentHashAtLastCheck: 0,
  };

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function evaluate(noteTitle: string, noteContent: string): void {
    // Debounce rapid changes (typing)
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      runChecks(noteTitle, noteContent);
    }, 2000);
  }

  function runChecks(noteTitle: string, noteContent: string): void {
    const now = Date.now();
    const contentHash = quickHash(noteContent);

    // Skip if content hasn't actually changed
    if (contentHash === state.contentHashAtLastCheck) return;
    state.contentHashAtLastCheck = contentHash;

    // Trigger 1: Suggest title for untitled notes with enough content
    const isUntitled = !noteTitle
      || noteTitle === "Untitled"
      || noteTitle === "New Note"
      || noteTitle.trim().length === 0;

    if (
      isUntitled &&
      !state.titleSuggested &&
      noteContent.length >= MIN_CONTENT_FOR_TITLE &&
      now - state.lastTitleCheck > TITLE_CHECK_DEBOUNCE_MS
    ) {
      state.lastTitleCheck = now;
      state.titleSuggested = true;
      callback({
        type: "suggest_title",
        payload: { contentPreview: noteContent.slice(0, 300) },
      });
    }

    // Reset title suggestion if title was manually set
    if (!isUntitled && state.titleSuggested) {
      state.titleSuggested = false;
    }

    // Trigger 2: Detect todo-like content without checkbox formatting
    if (
      TODO_PATTERN.test(noteContent) &&
      !noteContent.includes("- [ ]") &&
      noteContent.length > 50
    ) {
      callback({
        type: "suggest_todo",
        payload: {},
      });
    }

    state.lastContentLength = noteContent.length;
  }

  function dispose(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
  }

  return { evaluate, dispose };
}
