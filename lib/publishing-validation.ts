import { NextResponse } from 'next/server';
import { err } from '@/lib/api-response';

/**
 * Shared input validation for the six /api/publishing/* routes.
 *
 * Every field listed here is interpolated directly into a Gemini prompt, so
 * each one must be a string (never an object/array that would stringify to
 * garbage) and must be capped: short descriptor fields (title, genre, tones,
 * themes, names) at ~300 chars, long-form fields (synopsis, chapter
 * summaries, character notes) at ~30KB.
 */

export const SHORT_FIELD_MAX = 300;
export const LONG_FIELD_MAX = 30_000;

export interface PublishingFieldSpec {
  name: string;
  /** Missing/empty value → 400 listing the field as required. */
  required?: boolean;
  /** Maximum accepted length in characters. */
  max: number;
}

/** Convenience constructors so route specs read declaratively. */
export const shortField = (name: string, required = false): PublishingFieldSpec => ({
  name,
  required,
  max: SHORT_FIELD_MAX,
});
export const longField = (name: string, required = false): PublishingFieldSpec => ({
  name,
  required,
  max: LONG_FIELD_MAX,
});

/**
 * Validate a parsed JSON body against the route's field specs.
 * Returns a 400 `validation_failed` response on the first violation,
 * or null when the input is acceptable.
 */
export function validatePublishingInput(
  body: unknown,
  specs: PublishingFieldSpec[],
  init?: { requestId?: string },
): NextResponse | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return err('validation_failed', 'Request body must be a JSON object', 400, undefined, init);
  }
  const b = body as Record<string, unknown>;
  const missing: string[] = [];

  for (const spec of specs) {
    const value = b[spec.name];
    if (value === undefined || value === null || value === '') {
      if (spec.required) missing.push(spec.name);
      continue;
    }
    if (typeof value !== 'string') {
      return err(
        'validation_failed',
        `Field "${spec.name}" must be a string`,
        400,
        undefined,
        init,
      );
    }
    if (value.length > spec.max) {
      return err(
        'validation_failed',
        `Field "${spec.name}" is too long (max ${spec.max.toLocaleString('en-US')} characters)`,
        400,
        undefined,
        init,
      );
    }
  }

  if (missing.length > 0) {
    return err(
      'validation_failed',
      `Missing required fields: ${missing.join(', ')}`,
      400,
      undefined,
      init,
    );
  }
  return null;
}
