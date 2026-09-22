/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Whitelist of known, safe standardized error tokens
 */
const KNOWN_SAFE_CODES = new Set([
  'ERR_GENERATION',
  'RATE_LIMITED',
  'TIMEOUT',
  'HTTP_429',
  'HTTP_400',
  'HTTP_401',
  'HTTP_403',
  'HTTP_404',
  'HTTP_408',
  'HTTP_500',
  'HTTP_502',
  'HTTP_503',
  'HTTP_504',
  'HTTP_4XX',
  'HTTP_5XX',
  'SPAN_ERROR',
  'CUSTOM_ERROR',
  'QUOTA_EXCEEDED',
  'CONTEXT_LENGTH_EXCEEDED',
  'CONTENT_FILTER',
  'MODEL_NOT_FOUND',
  'AUTH_ERROR',
  'CONNECTION_ERROR',
]);

/**
 * Sanitizes arbitrary error messages, exception strings, and status messages at the normalization boundary.
 * Guarantees that canonical AIEvent.error_code NEVER contains raw prompt text, completion text, or arbitrary PII.
 */
export function sanitizeErrorCode(
  rawStatusOrMessage: string | undefined,
  rawErrorToken: unknown,
  statusCode?: number | string
): string | undefined {
  const numStatus = Number(statusCode);

  // 1. Direct HTTP Status Code checks
  if (numStatus === 429) return 'HTTP_429';
  if (numStatus === 408) return 'TIMEOUT';
  if (numStatus >= 500 && numStatus < 600) return `HTTP_${numStatus}`;
  if (numStatus >= 400 && numStatus < 500) return `HTTP_${numStatus}`;

  // 2. Inspect raw error token / code if supplied
  const candidate = String(rawErrorToken || rawStatusOrMessage || '').trim();
  if (!candidate) return undefined;

  // Check if candidate matches an existing uppercase safe code
  const upper = candidate.toUpperCase();
  if (KNOWN_SAFE_CODES.has(upper)) {
    return upper;
  }

  // If candidate is a concise alphanumeric identifier (e.g. "rate_limit_exceeded", "context_length_exceeded")
  // and has NO spaces, commas, quotes, colons, newlines, or prompt-like structures:
  if (/^[a-z0-9_-]{3,32}$/i.test(candidate)) {
    const normalized = candidate.toUpperCase().replace(/-/g, '_');
    if (normalized.includes('RATE') || normalized.includes('429')) return 'RATE_LIMITED';
    if (normalized.includes('TIMEOUT') || normalized.includes('DEADLINE')) return 'TIMEOUT';
    if (normalized.includes('QUOTA')) return 'QUOTA_EXCEEDED';
    if (normalized.includes('CONTEXT') || normalized.includes('TOKEN')) return 'CONTEXT_LENGTH_EXCEEDED';
    if (normalized.includes('AUTH') || normalized.includes('KEY') || normalized.includes('PERMISSION')) return 'AUTH_ERROR';
    if (normalized.includes('FILTER') || normalized.includes('SAFETY')) return 'CONTENT_FILTER';
    return normalized;
  }

  // 3. Fallback classification from arbitrary message text without leaking text
  const lower = candidate.toLowerCase();
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'RATE_LIMITED';
  }
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('deadline exceeded')) {
    return 'TIMEOUT';
  }
  if (lower.includes('quota') || lower.includes('credit') || lower.includes('billing')) {
    return 'QUOTA_EXCEEDED';
  }
  if (lower.includes('context length') || lower.includes('maximum context') || lower.includes('max_tokens')) {
    return 'CONTEXT_LENGTH_EXCEEDED';
  }
  if (lower.includes('content management policy') || lower.includes('safety') || lower.includes('moderation') || lower.includes('content filter')) {
    return 'CONTENT_FILTER';
  }
  if (lower.includes('unauthorized') || lower.includes('api key') || lower.includes('permission denied') || lower.includes('401') || lower.includes('403')) {
    return 'AUTH_ERROR';
  }
  if (lower.includes('500') || lower.includes('502') || lower.includes('503') || lower.includes('504') || lower.includes('internal server') || lower.includes('bad gateway')) {
    return 'HTTP_5XX';
  }
  if (lower.includes('connection reset') || lower.includes('econnreset') || lower.includes('network error')) {
    return 'CONNECTION_ERROR';
  }

  return 'ERR_GENERATION';
}
