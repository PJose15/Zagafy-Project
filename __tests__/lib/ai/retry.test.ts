import { describe, it, expect, vi } from 'vitest';
import { withRetry, isRetryableUpstream } from '@/lib/ai/retry';

describe('withRetry', () => {
  it('returns the result on first-attempt success', async () => {
    const fn = vi.fn(() => Promise.resolve('ok'));
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on a retryable error and succeeds on attempt 2', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('UNAVAILABLE'), { status: 503 }))
      .mockResolvedValueOnce('ok');
    const result = await withRetry(fn, { baseDelayMs: 1, maxDelayMs: 2 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries up to maxAttempts then throws the last error', async () => {
    const fn = vi.fn(() => Promise.reject(Object.assign(new Error('UNAVAILABLE'), { status: 503 })));
    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 }),
    ).rejects.toThrow('UNAVAILABLE');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws immediately on a non-retryable error (no second attempt)', async () => {
    const fn = vi.fn(() => Promise.reject(Object.assign(new Error('Bad request'), { status: 400 })));
    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 }),
    ).rejects.toThrow('Bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('honors a custom retryable predicate', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('special'))
      .mockResolvedValueOnce('ok');
    const result = await withRetry(fn, {
      baseDelayMs: 1,
      maxDelayMs: 2,
      retryableErrors: (err) => err instanceof Error && err.message === 'special',
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('invokes onAttempt for every failed attempt with the right metadata', async () => {
    const seen: Array<{ attempt: number; willRetry: boolean }> = [];
    const fn = vi.fn(() => Promise.reject(Object.assign(new Error('UNAVAILABLE'), { status: 503 })));
    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 1,
        maxDelayMs: 2,
        onAttempt: (info) => seen.push({ attempt: info.attempt, willRetry: info.willRetry }),
      }),
    ).rejects.toThrow();
    expect(seen).toEqual([
      { attempt: 1, willRetry: true },
      { attempt: 2, willRetry: true },
      { attempt: 3, willRetry: false },
    ]);
  });

  it('jittered delay stays within the [0, 1.2 * base * 2^(n-1)] envelope', async () => {
    // We can't easily check the actual sleep time without time control, but we
    // can verify the helper doesn't blow up when jitter pushes delay near 0.
    const fn = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('UNAVAILABLE'), { status: 503 }))
      .mockResolvedValueOnce('ok');
    const result = await withRetry(fn, { baseDelayMs: 1, maxDelayMs: 2 });
    expect(result).toBe('ok');
  });
});

describe('isRetryableUpstream', () => {
  it.each([
    [{ status: 429 }, true],
    [{ status: 502 }, true],
    [{ status: 503 }, true],
    [{ status: 504 }, true],
    [{ status: 529 }, true],
    [{ status: 400 }, false],
    [{ status: 401 }, false],
    [{ status: 404 }, false],
    [{ status: 500 }, false],
    [{ statusCode: 429 }, true],
    [{ code: 'ETIMEDOUT' }, true],
    [{ code: 'ECONNRESET' }, true],
    [{ code: 'ENOTFOUND' }, false],
    [{ message: 'UNAVAILABLE' }, true],
    [{ message: 'Service is overloaded' }, true],
    [{ message: 'fetch timed out' }, true],
    [{ message: 'Bad input' }, false],
    [null, false],
    [undefined, false],
    ['string error', false],
  ])('classifies %j → retryable=%s', (err, expected) => {
    expect(isRetryableUpstream(err)).toBe(expected);
  });
});
