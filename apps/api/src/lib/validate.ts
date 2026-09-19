import type { z } from 'zod';
import { AppError, zodDetails } from './errors';

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) throw AppError.badRequest('Some fields are invalid.', zodDetails(result.error));
  return result.data;
}

export function parseQuery<T>(schema: z.ZodType<T>, query: unknown): T {
  const result = schema.safeParse(query ?? {});
  if (!result.success) throw AppError.badRequest('Some query parameters are invalid.', zodDetails(result.error));
  return result.data;
}

const ID_RE = /^[a-z0-9]{20,32}$/;

export function parseId(value: unknown): string {
  if (typeof value !== 'string' || !ID_RE.test(value)) throw AppError.notFound();
  return value;
}

// Control characters, zero-width characters and bidi overrides (used for text-spoofing).
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const INVISIBLE_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B-\\u200F\\u202A-\\u202E]', 'g');

/** Removes control characters and markup from free text before it is processed or stored. */
export function sanitizeText(input: string): string {
  return input
    .normalize('NFC')
    .replace(/<[^>]*>/g, ' ')
    .replace(INVISIBLE_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();
}
