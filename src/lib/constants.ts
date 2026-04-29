// Centralized configuration constants for BlackNote extension

export const AI_API_BASE =
  "https://blacknote-api-676582412453.us-central1.run.app";

export const CHECKOUT_BASE =
  "https://graphosai.lemonsqueezy.com/checkout/buy/2a8c453e-7b12-4743-bf50-8571c9cfae30";

export const PRIVACY_POLICY_URL =
  "https://graphosai.github.io/blacknote-privacy";

export enum ErrorCode {
  TRANSCRIPT_NOT_FOUND = "TRANSCRIPT_NOT_FOUND",
  NO_READABLE_CONTENT = "NO_READABLE_CONTENT",
  DOM_CAPTURE_FAILED = "DOM_CAPTURE_FAILED",
  CLIP_FAILED = "CLIP_FAILED",
  UNKNOWN_ERROR = "UNKNOWN_ERROR"
}
