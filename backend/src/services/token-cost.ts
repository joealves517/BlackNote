/**
 * Token-based cost calculation for Vertex AI usage.
 *
 * Pricing (Gemini 2.5 Flash):
 *   Input:  $0.30 per 1M tokens
 *   Output: $2.50 per 1M tokens
 *
 * Credit system:
 *   1 credit = $0.001 (0.1 cent)
 *   Budget per cycle: $3.99 → 3,990 credits
 */

const INPUT_PRICE_PER_MILLION = 0.25;
const OUTPUT_PRICE_PER_MILLION = 1.50;
const DOLLARS_PER_CREDIT = 0.001;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Calculate credit cost from actual token usage.
 * Returns minimum 1 credit for any completed request.
 */
export function calculateTokenCost(usage: TokenUsage): number {
  const inputCost = (usage.inputTokens * INPUT_PRICE_PER_MILLION) / 1_000_000;
  const outputCost = (usage.outputTokens * OUTPUT_PRICE_PER_MILLION) / 1_000_000;
  const totalDollars = inputCost + outputCost;
  const credits = totalDollars / DOLLARS_PER_CREDIT;

  return Math.max(1, Math.ceil(credits));
}

/** Credits granted per subscription cycle ($3.99 budget) */
export const CREDITS_PER_CYCLE = 3990;
