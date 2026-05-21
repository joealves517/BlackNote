/**
 * Clarification Engine — Ambiguity detection & guided clarification.
 *
 * Factor 11 (Human-in-the-Loop): Instead of guessing when an instruction
 * is ambiguous, the agent asks for clarification BEFORE wasting LLM tokens
 * and potentially applying wrong changes.
 *
 * This is a deterministic pre-LLM gate — zero token cost.
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface ClarificationRequest {
  needed: boolean;
  reason: string;
  suggestions: string[];
}

// ─── Ambiguity Patterns ─────────────────────────────────────────────

/**
 * Vague pronouns without clear antecedent — "fix it", "change this"
 * with no context about WHAT to fix or change.
 */
const VAGUE_PRONOUN_RE =
  /^(fix|change|update|modify|edit|sửa|thay đổi|chỉnh)\s+(it|this|that|these|those|them|nó|cái này|cái đó)\s*[.!]?$/i;

/**
 * Single-word instructions that are too ambiguous.
 */
const SINGLE_WORD_AMBIGUOUS = new Set([
  "fix", "change", "update", "edit", "improve", "modify", "redo", "do",
  "sửa", "đổi", "chỉnh", "làm",
]);

/**
 * Conflicting scope — instructions that mention both specific and global scope.
 */
const CONFLICTING_SCOPE_RE =
  /\b(only|just|first|last)\b.*\b(all|every|entire|whole)\b/i;

/**
 * Language ambiguity — "translate" without specifying target language.
 */
const TRANSLATE_NO_TARGET_RE =
  /^(translate|dịch)\s*$/i;

// ─── Detector ───────────────────────────────────────────────────────

/**
 * Check if an instruction is too ambiguous to execute safely.
 *
 * Returns a ClarificationRequest with:
 * - needed: true if the agent should ask for more info
 * - reason: human-readable explanation
 * - suggestions: quick-pick options the user can tap
 */
export function detectAmbiguity(
  instruction: string,
  documentIsEmpty: boolean,
  documentBlockCount: number
): ClarificationRequest {
  const trimmed = instruction.trim();

  // Single-word instruction
  if (SINGLE_WORD_AMBIGUOUS.has(trimmed.toLowerCase())) {
    return {
      needed: true,
      reason: `"${trimmed}" — what exactly should I ${trimmed.toLowerCase()}?`,
      suggestions: [
        `${trimmed} grammar and spelling`,
        `${trimmed} the formatting`,
        `${trimmed} the entire document`,
      ],
    };
  }

  // Vague pronoun with no document context
  if (VAGUE_PRONOUN_RE.test(trimmed) && documentBlockCount > 3) {
    return {
      needed: true,
      reason: "Which part of the document should I modify?",
      suggestions: [
        "The first paragraph",
        "The whole document",
        "The selected text",
      ],
    };
  }

  // "Translate" without target language
  if (TRANSLATE_NO_TARGET_RE.test(trimmed)) {
    return {
      needed: true,
      reason: "Which language should I translate to?",
      suggestions: [
        "Translate to English",
        "Translate to Vietnamese",
        "Translate to Japanese",
      ],
    };
  }

  // Empty document + editing instruction
  if (documentIsEmpty && /\b(fix|edit|improve|shorten|sửa|chỉnh|rút gọn)\b/i.test(trimmed)) {
    return {
      needed: true,
      reason: "The document is empty — there's nothing to edit yet.",
      suggestions: [
        "Write a draft about...",
        "Create a to-do list for...",
        "Generate an outline for...",
      ],
    };
  }

  // Conflicting scope
  if (CONFLICTING_SCOPE_RE.test(trimmed)) {
    return {
      needed: true,
      reason: "Your instruction has conflicting scope — should I change specific parts or everything?",
      suggestions: [
        "Only the selected section",
        "The entire document",
      ],
    };
  }

  return { needed: false, reason: "", suggestions: [] };
}
