import { NextResponse } from 'next/server';

/**
 * Phase 3.1 — standardized API response envelope.
 *
 * Every server route returns one of these two shapes:
 *
 *   { ok: true,  data: T,            requestId, timestamp, ...legacyFields }
 *   { ok: false, code, message,      requestId, timestamp, error }
 *
 * Legacy fields (the old top-level data and `error` keys) are preserved on
 * the response so older client code keeps working during the migration.
 * New client code should call `parseApiResponse<T>()` and switch on `ok`.
 */

export type ApiErrorCode =
  | 'rate_limited'
  | 'validation_failed'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'upstream_unavailable'
  | 'upstream_timeout'
  | 'parse_error'
  | 'internal_error'
  | 'cors_denied';

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  requestId: string;
  timestamp: string;
}

export interface ApiError {
  ok: false;
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
  /** Legacy alias — older clients read `body.error`. */
  error: string;
  requestId: string;
  timestamp: string;
}

export function makeRequestId(): string {
  return crypto.randomUUID();
}

function makeTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Success response. The payload is exposed twice:
 *   - flattened onto the top level for legacy callers (`body.someField`)
 *   - inside `data` for new callers using parseApiResponse<T>().
 *
 * The flatten step is skipped if T is not an object so primitives still
 * appear under `data`.
 */
export function ok<T>(data: T, init?: { status?: number; requestId?: string }): NextResponse {
  const envelope = {
    ok: true as const,
    data,
    requestId: init?.requestId ?? makeRequestId(),
    timestamp: makeTimestamp(),
  };
  const body =
    data && typeof data === 'object' && !Array.isArray(data)
      ? { ...(data as Record<string, unknown>), ...envelope }
      : envelope;
  return NextResponse.json(body, { status: init?.status ?? 200 });
}

/**
 * Error response. Sets the `error` legacy field to `message` so older test
 * assertions (`expect(body.error).toBe('Foo')`) keep passing.
 */
export function err(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: Record<string, unknown>,
  init?: { requestId?: string },
): NextResponse {
  const body: ApiError = {
    ok: false,
    code,
    message,
    error: message,
    ...(details !== undefined ? { details } : {}),
    requestId: init?.requestId ?? makeRequestId(),
    timestamp: makeTimestamp(),
  };
  return NextResponse.json(body, { status });
}

/**
 * Map common HTTP statuses onto our stable error codes. Used by routes that
 * only know "the upstream returned 429" and want a uniform code on the wire.
 */
export function statusToCode(status: number): ApiErrorCode {
  if (status === 400) return 'validation_failed';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status === 504) return 'upstream_timeout';
  if (status === 502 || status === 503) return 'upstream_unavailable';
  return 'internal_error';
}

/**
 * Client-side: parse a fetch response into the envelope. Returns the
 * discriminated union so callers can `if (!result.ok) {...}` cleanly.
 */
export type ParsedResponse<T> = ApiSuccess<T> | ApiError;

export async function parseApiResponse<T>(res: Response): Promise<ParsedResponse<T>> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      code: 'parse_error',
      message: 'Response was not valid JSON',
      error: 'Response was not valid JSON',
      requestId: '',
      timestamp: makeTimestamp(),
    };
  }

  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (b.ok === true) {
      return {
        ok: true,
        data: (b.data as T) ?? (body as T),
        requestId: typeof b.requestId === 'string' ? b.requestId : '',
        timestamp: typeof b.timestamp === 'string' ? b.timestamp : makeTimestamp(),
      };
    }
    if (b.ok === false) {
      return {
        ok: false,
        code: (b.code as ApiErrorCode) ?? statusToCode(res.status),
        message: typeof b.message === 'string' ? b.message : String(b.error ?? 'Unknown error'),
        error: typeof b.error === 'string' ? b.error : String(b.message ?? 'Unknown error'),
        details: b.details as Record<string, unknown> | undefined,
        requestId: typeof b.requestId === 'string' ? b.requestId : '',
        timestamp: typeof b.timestamp === 'string' ? b.timestamp : makeTimestamp(),
      };
    }
    // Legacy shape with no envelope — infer from HTTP status.
    if (res.ok) {
      return {
        ok: true,
        data: body as T,
        requestId: '',
        timestamp: makeTimestamp(),
      };
    }
    const message = typeof b.error === 'string' ? b.error : `HTTP ${res.status}`;
    return {
      ok: false,
      code: statusToCode(res.status),
      message,
      error: message,
      requestId: '',
      timestamp: makeTimestamp(),
    };
  }

  return {
    ok: false,
    code: 'parse_error',
    message: 'Response body was not an object',
    error: 'Response body was not an object',
    requestId: '',
    timestamp: makeTimestamp(),
  };
}
