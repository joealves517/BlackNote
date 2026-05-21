/**
 * Agent Router — Deterministic instruction classifier.
 *
 * Factor 1 (Natural Language is the New Protocol): The router inspects the
 * user's instruction and the document state to deterministically pick the
 * best-fit agent, without burning LLM tokens on routing decisions.
 *
 * Factor 10 (Small Focused Agents): Instead of one monolith system prompt
 * handling everything, we route to specialized "agent modes" with focused
 * prompts and tailored model configs.
 */

// ─── Agent Types ────────────────────────────────────────────────────

export type AgentMode =
  | "edit"           // Modify specific blocks, insert, delete
  | "format"         // Reformat, restructure, translate entire doc
  | "generate"       // Write from scratch, brainstorm, generate content
  | "image"          // Generate/draw/create visual content
  | "question"       // Answer a question about the document (no edits)
  | "title";         // Rename or improve the note title

export interface RouteResult {
  mode: AgentMode;
  temperature: number;
  maxOutputTokens: number;
  requiresFullDoc: boolean;
}

// ─── Pattern Matchers ───────────────────────────────────────────────

const IMAGE_PATTERNS = [
  /\b(draw|generate|create|make|design)\b.*\b(image|picture|photo|illustration|icon|logo|diagram|art|drawing)\b/i,
  /\b(vẽ|tạo|thiết kế)\b.*\b(hình|ảnh|tranh|biểu tượng|logo|sơ đồ)\b/i,
  /\b(image|picture|photo|illustration)\b.*\b(of|for|about|showing)\b/i,
];

const FORMAT_PATTERNS = [
  /\b(translate|rewrite|reformat|restructure|convert|summarize|shorten|condense|professional)\b/i,
  /\b(dịch|viết lại|tóm tắt|chuyên nghiệp|rút gọn|chuyển đổi)\b/i,
  /\b(make|turn)\b.*\b(it|this|the\s+(?:whole|entire))\b.*\b(into|to|as)\b/i,
  /\b(format|style)\b.*\b(as|like|to)\b/i,
  /\b(the\s+)?whole\b.*\b(document|note|page)\b/i,
  /\b(toàn bộ|cả|hết)\b.*\b(tài liệu|ghi chú|trang)\b/i,
];

const TITLE_PATTERNS = [
  /\b(rename|retitle|change\s+title|update\s+title|set\s+title|improve\s+title)\b/i,
  /\b(đổi tên|đặt tên|sửa tên|cải thiện tiêu đề)\b/i,
];

const QUESTION_PATTERNS = [
  /^(what|who|where|when|why|how|is|are|do|does|can|could|should|would|explain|tell me|describe)\b/i,
  /^(gì|ai|ở đâu|khi nào|tại sao|thế nào|có phải|hãy|giải thích|cho tôi biết|mô tả)\b/i,
  /\?\s*$/,
];

const GENERATE_PATTERNS = [
  /\b(write|create|compose|draft|brainstorm|generate|outline|list)\b.*\b(about|for|on|a|an|the|some)\b/i,
  /\b(viết|tạo|soạn|lập|liệt kê|đề xuất)\b/i,
  /\b(add|insert|append)\b.*\b(section|paragraph|list|table|heading|chapter)\b/i,
  /\b(thêm|chèn)\b.*\b(phần|đoạn|danh sách|bảng|tiêu đề|chương)\b/i,
];

// ─── Router ─────────────────────────────────────────────────────────

/**
 * Classify the user's instruction into an agent mode using deterministic
 * pattern matching. This avoids wasting LLM tokens on routing.
 *
 * Priority order matters — more specific patterns are checked first:
 * 1. Image (most distinct intent)
 * 2. Title (specific action)
 * 3. Question (interrogative)
 * 4. Format (whole-doc transforms)
 * 5. Generate (new content creation)
 * 6. Edit (fallback — block-level modifications)
 */
export function routeInstruction(
  instruction: string,
  documentIsEmpty: boolean
): RouteResult {
  const trimmed = instruction.trim();

  // Image generation — most distinct, check first
  if (IMAGE_PATTERNS.some(p => p.test(trimmed))) {
    return {
      mode: "image",
      temperature: 0.4,
      maxOutputTokens: 2048,
      requiresFullDoc: false,
    };
  }

  // Title changes
  if (TITLE_PATTERNS.some(p => p.test(trimmed))) {
    return {
      mode: "title",
      temperature: 0.5,
      maxOutputTokens: 256,
      requiresFullDoc: false,
    };
  }

  // Questions about the document (no editing)
  if (QUESTION_PATTERNS.some(p => p.test(trimmed))) {
    return {
      mode: "question",
      temperature: 0.7,
      maxOutputTokens: 2048,
      requiresFullDoc: true,
    };
  }

  // Whole-document formatting/restructuring
  if (FORMAT_PATTERNS.some(p => p.test(trimmed))) {
    return {
      mode: "format",
      temperature: 0.3,
      maxOutputTokens: 8192,
      requiresFullDoc: true,
    };
  }

  // Generate new content (especially for empty docs)
  if (documentIsEmpty || GENERATE_PATTERNS.some(p => p.test(trimmed))) {
    return {
      mode: "generate",
      temperature: 0.7,
      maxOutputTokens: 4096,
      requiresFullDoc: false,
    };
  }

  // Default: block-level editing
  return {
    mode: "edit",
    temperature: 0.3,
    maxOutputTokens: 4096,
    requiresFullDoc: true,
  };
}

// ─── Mode-specific prompt enhancers ─────────────────────────────────

/**
 * Generate a mode-specific instruction prefix that gets prepended to
 * the system prompt, guiding the LLM toward the right behavior.
 */
export function getModeGuidance(mode: AgentMode): string {
  switch (mode) {
    case "edit":
      return `CONTEXT: The user wants to edit specific parts of the document.
STRATEGY: Identify exactly which blocks need changes. Return ONLY changed blocks with their markers. Be precise — do not touch blocks the instruction doesn't target.`;

    case "format":
      return `CONTEXT: The user wants to reformat, restructure, or transform the entire document.
STRATEGY: Use «replace_all» to output the complete rewritten document. Do NOT use individual block markers for whole-document transforms — it's error-prone and slow.`;

    case "generate":
      return `CONTEXT: The user wants new content generated and added to the document.
STRATEGY: Use «new» markers for each new block. If the document is empty, generate a well-structured document. Match the user's language.`;

    case "image":
      return `CONTEXT: The user wants an image generated.
STRATEGY: Use the generate_image tool with a highly detailed English prompt. Wait for the URL, then output it as a Markdown image in the appropriate location.`;

    case "question":
      return `CONTEXT: The user is asking a question, NOT requesting edits.
STRATEGY: Answer the question naturally in plain text. Do NOT use block markers (no «bN», «new», etc.). Use the document content as context for your answer.`;

    case "title":
      return `CONTEXT: The user wants to change the note title.
STRATEGY: Output ONLY «title» followed by the new title text. Do not modify any document blocks.`;
  }
}
