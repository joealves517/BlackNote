/**
 * Agent Guard — Response validation & self-healing utilities.
 *
 * Factor 7 (Compact Errors into Context): When agent output is malformed,
 * we detect it early and provide structured error recovery instead of
 * silently applying broken changes.
 *
 * Factor 9 (Self-Healing): Retry with exponential backoff for transient
 * failures (network, rate-limit, server errors).
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface ValidationResult {
  isValid: boolean;
  issues: string[];
  recoverable: boolean;
  suggestion?: string;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[];
}

// ─── Response Validation ────────────────────────────────────────────

const BLOCK_MARKER_RE = /«(b\d+|new|title|replace_all)»/;
const ORPHAN_MARKER_RE = /»[^«]*«/;
const HALLUCINATED_URL_RE = /!\[.*?\]\((?!https?:\/\/[^\s)]+s3[^\s)]+|https?:\/\/[^\s)]+blacknote)/i;

/**
 * Validate the raw agent response before applying to the editor.
 *
 * Catches:
 * - Truncated responses (stream cut off mid-block)
 * - Hallucinated image URLs (not from S3)
 * - Orphan markers (broken «bN» structure)
 * - Empty responses
 */
export function validateAgentResponse(
  rawResponse: string,
  expectedBlockCount: number
): ValidationResult {
  const issues: string[] = [];
  const trimmed = rawResponse.trim();

  // Empty response
  if (!trimmed) {
    return {
      isValid: false,
      issues: ["Empty response from AI"],
      recoverable: true,
      suggestion: "The AI returned an empty response. Try rephrasing your instruction.",
    };
  }

  // Check if it's a question response (no markers expected)
  const hasMarkers = BLOCK_MARKER_RE.test(trimmed);
  if (!hasMarkers) {
    // Could be a valid question-answer — no markers is fine
    return { isValid: true, issues: [], recoverable: true };
  }

  // Truncation detection: response ends mid-marker or mid-code-block
  if (trimmed.endsWith("«") || trimmed.endsWith("«b")) {
    issues.push("Response appears truncated (ends with incomplete marker)");
  }

  const openCodeBlocks = (trimmed.match(/```/g) || []).length;
  if (openCodeBlocks % 2 !== 0) {
    issues.push("Unclosed code block detected — response may be truncated");
  }

  // Orphan markers (broken structure)
  if (ORPHAN_MARKER_RE.test(trimmed)) {
    issues.push("Malformed block markers detected");
  }

  // Hallucinated image URLs (not from our S3 bucket)
  const imageMatches = trimmed.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/g);
  if (imageMatches) {
    for (const match of imageMatches) {
      const urlMatch = match.match(/\((https?:\/\/[^\s)]+)\)/);
      if (urlMatch && !urlMatch[1].includes("s3.") && !urlMatch[1].includes("amazonaws.com")) {
        issues.push(`Potentially hallucinated image URL: ${urlMatch[1].slice(0, 50)}...`);
      }
    }
  }

  // Block reference overflow — referencing blocks that don't exist
  const blockRefs = trimmed.match(/«b(\d+)»/g);
  if (blockRefs && expectedBlockCount > 0) {
    for (const ref of blockRefs) {
      const idx = parseInt(ref.match(/\d+/)![0], 10);
      if (idx >= expectedBlockCount) {
        issues.push(`Reference to non-existent block «b${idx}» (document has ${expectedBlockCount} blocks)`);
      }
    }
  }

  const hasBlockingIssues = issues.some(
    (i) => i.includes("truncated") || i.includes("Malformed")
  );

  return {
    isValid: issues.length === 0,
    issues,
    recoverable: true,
    suggestion: hasBlockingIssues
      ? "The AI response was incomplete. Retrying automatically..."
      : undefined,
  };
}

// ─── Retry with Exponential Backoff ─────────────────────────────────

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
  retryableStatuses: [429, 500, 502, 503, 504],
};

/**
 * Execute a fetch with retry logic and exponential backoff.
 *
 * Retries on:
 * - Network errors (fetch throws)
 * - 429 (rate limit)
 * - 5xx (server errors)
 *
 * Does NOT retry on:
 * - 400 (bad request — our fault)
 * - 401/403 (auth — won't fix itself)
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  config: Partial<RetryConfig> = {}
): Promise<Response> {
  const { maxAttempts, baseDelayMs, maxDelayMs, retryableStatuses } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, options);

      // Non-retryable error → return immediately
      if (!response.ok && !retryableStatuses.includes(response.status)) {
        return response;
      }

      // Success → return
      if (response.ok) {
        return response;
      }

      // Retryable error → wait and retry
      console.warn(
        `[Agent Guard] Attempt ${attempt}/${maxAttempts} failed with ${response.status}. Retrying...`
      );
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      // Network error → retryable
      console.warn(
        `[Agent Guard] Attempt ${attempt}/${maxAttempts} network error: ${(err as Error).message}`
      );
      lastError = err as Error;
    }

    // Wait with exponential backoff + jitter before retry
    if (attempt < maxAttempts) {
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const jitter = delay * 0.2 * Math.random();
      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
    }
  }

  throw lastError || new Error("All retry attempts exhausted");
}

// ─── Stream Reading with Timeout ────────────────────────────────────

/**
 * Read a streaming response with a per-chunk timeout.
 * Prevents infinite hangs when the server stops sending data mid-stream.
 */
export async function readStreamWithTimeout(
  response: Response,
  timeoutMs: number = 30000
): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const readPromise = reader.read();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Stream read timeout")), timeoutMs)
    );

    try {
      const { done, value } = await Promise.race([readPromise, timeoutPromise]);
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
    } catch (err) {
      // Timeout — cancel the reader and return what we have
      console.warn("[Agent Guard] Stream timeout — returning partial response");
      reader.cancel().catch(() => {});
      break;
    }
  }

  return fullText;
}
