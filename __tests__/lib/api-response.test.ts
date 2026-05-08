import { describe, it, expect } from 'vitest';
import { ok, err, statusToCode, parseApiResponse } from '@/lib/api-response';

describe('lib/api-response — ok()', () => {
  it('returns the canonical success envelope', async () => {
    const res = ok({ greeting: 'hello' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ greeting: 'hello' });
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId.length).toBeGreaterThan(0);
    expect(typeof body.timestamp).toBe('string');
  });

  it('flattens object payloads onto the top level for legacy callers', async () => {
    const res = ok({ greeting: 'hi', count: 7 });
    const body = await res.json();
    expect(body.greeting).toBe('hi');
    expect(body.count).toBe(7);
    // The envelope still wins for ok / data / requestId / timestamp.
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ greeting: 'hi', count: 7 });
  });

  it('does NOT flatten arrays — they live under data only', async () => {
    const res = ok([1, 2, 3]);
    const body = await res.json();
    expect(body.data).toEqual([1, 2, 3]);
    expect(body[0]).toBeUndefined();
  });

  it('honors a custom status code', async () => {
    const res = ok({}, { status: 201 });
    expect(res.status).toBe(201);
  });
});

describe('lib/api-response — err()', () => {
  it('returns the canonical error envelope with legacy alias', async () => {
    const res = err('rate_limited', 'Too many requests', 429);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe('rate_limited');
    expect(body.message).toBe('Too many requests');
    expect(body.error).toBe('Too many requests'); // legacy alias
    expect(typeof body.requestId).toBe('string');
    expect(typeof body.timestamp).toBe('string');
  });

  it('passes details through when provided', async () => {
    const res = err('validation_failed', 'Bad input', 400, { field: 'transcript' });
    const body = await res.json();
    expect(body.details).toEqual({ field: 'transcript' });
  });

  it('omits details when not provided', async () => {
    const res = err('internal_error', 'oops', 500);
    const body = await res.json();
    expect(body.details).toBeUndefined();
  });
});

describe('lib/api-response — statusToCode()', () => {
  it.each([
    [400, 'validation_failed'],
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [429, 'rate_limited'],
    [502, 'upstream_unavailable'],
    [503, 'upstream_unavailable'],
    [504, 'upstream_timeout'],
    [500, 'internal_error'],
    [418, 'internal_error'],
  ])('maps HTTP %d → %s', (status, code) => {
    expect(statusToCode(status)).toBe(code);
  });
});

describe('lib/api-response — parseApiResponse()', () => {
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('parses a canonical success envelope', async () => {
    const parsed = await parseApiResponse<{ x: number }>(
      jsonResponse({ ok: true, data: { x: 42 }, requestId: 'r-1', timestamp: '2026-05-04T00:00:00Z' }),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data).toEqual({ x: 42 });
      expect(parsed.requestId).toBe('r-1');
    }
  });

  it('parses a canonical error envelope', async () => {
    const parsed = await parseApiResponse(
      jsonResponse({ ok: false, code: 'rate_limited', message: 'slow down', error: 'slow down' }, 429),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.code).toBe('rate_limited');
      expect(parsed.message).toBe('slow down');
    }
  });

  it('falls back to legacy success shape when envelope is absent', async () => {
    const parsed = await parseApiResponse<{ greeting: string }>(
      jsonResponse({ greeting: 'hello' }, 200),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data).toEqual({ greeting: 'hello' });
  });

  it('falls back to legacy error shape and infers code from HTTP status', async () => {
    const parsed = await parseApiResponse(jsonResponse({ error: 'Forbidden' }, 403));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.code).toBe('forbidden');
      expect(parsed.message).toBe('Forbidden');
    }
  });

  it('returns parse_error when the body is not JSON', async () => {
    const res = new Response('not json', { status: 200, headers: { 'content-type': 'text/plain' } });
    const parsed = await parseApiResponse(res);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.code).toBe('parse_error');
  });
});
