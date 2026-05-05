import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { detectBotSignals, shouldLogBotSignals } from '@/lib/bot-signals';

function makeRequest(
  headers: Record<string, string> = {},
  pathname = '/api/chat',
): NextRequest {
  // Provide a sensible default Accept-Language / Accept-Encoding so we can
  // selectively unset them in specific tests.
  const merged: Record<string, string> = {
    'accept-language': 'en-US',
    'accept-encoding': 'gzip, deflate, br',
    ...headers,
  };
  return new NextRequest(`http://localhost${pathname}`, {
    method: 'POST',
    headers: merged,
  });
}

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const FIREFOX_UA =
  'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0';
const SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

describe('detectBotSignals', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('scores legitimate Chrome below the log threshold', () => {
    const r = detectBotSignals(makeRequest({
      'user-agent': CHROME_UA,
      'referer': 'http://localhost/manuscript',
    }));
    expect(r.score).toBeLessThan(30);
  });

  it('scores legitimate Firefox below the log threshold', () => {
    const r = detectBotSignals(makeRequest({
      'user-agent': FIREFOX_UA,
      'referer': 'http://localhost/manuscript',
    }));
    expect(r.score).toBeLessThan(30);
  });

  it('scores legitimate mobile Safari below the log threshold', () => {
    const r = detectBotSignals(makeRequest({
      'user-agent': SAFARI_UA,
      'referer': 'http://localhost/flow',
    }));
    expect(r.score).toBeLessThan(30);
  });

  it('flags missing user-agent with +50', () => {
    const r = detectBotSignals(makeRequest({}));
    expect(r.signals).toContain('missing-user-agent');
    expect(r.score).toBeGreaterThanOrEqual(50);
  });

  it('flags self-declared bot UA', () => {
    const r = detectBotSignals(makeRequest({
      'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
    }));
    expect(r.signals).toContain('bot-keyword-in-user-agent');
    expect(r.score).toBeGreaterThanOrEqual(50);
  });

  it('flags HeadlessChrome', () => {
    const r = detectBotSignals(makeRequest({
      'user-agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/124.0.0.0 Safari/537.36',
    }));
    expect(r.signals).toContain('headless-or-library-user-agent');
    expect(r.score).toBeGreaterThanOrEqual(30);
  });

  it('flags python-requests UA', () => {
    const r = detectBotSignals(makeRequest({
      'user-agent': 'python-requests/2.31.0',
    }));
    expect(r.signals).toContain('headless-or-library-user-agent');
    expect(r.score).toBeGreaterThanOrEqual(30);
  });

  it('flags missing accept-language', () => {
    // Override the default by passing only what we want.
    const req = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'user-agent': CHROME_UA, 'accept-encoding': 'gzip' },
    });
    const r = detectBotSignals(req);
    expect(r.signals).toContain('missing-accept-language');
  });

  it('flags missing accept-encoding', () => {
    const req = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'user-agent': CHROME_UA, 'accept-language': 'en-US' },
    });
    const r = detectBotSignals(req);
    expect(r.signals).toContain('missing-accept-encoding');
  });

  it('flags API call with no referer in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const r = detectBotSignals(makeRequest({ 'user-agent': CHROME_UA }, '/api/chat'));
    expect(r.signals).toContain('api-call-no-referer');
  });

  it('does NOT flag missing referer in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const r = detectBotSignals(makeRequest({ 'user-agent': CHROME_UA }, '/api/chat'));
    expect(r.signals).not.toContain('api-call-no-referer');
  });

  it('does NOT flag non-API paths for missing referer', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const r = detectBotSignals(makeRequest({ 'user-agent': CHROME_UA }, '/manuscript'));
    expect(r.signals).not.toContain('api-call-no-referer');
  });

  it('combines signals and crosses the high-confidence threshold', () => {
    const req = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'user-agent': 'curl/8.0' },
    });
    const r = detectBotSignals(req);
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(shouldLogBotSignals(r)).toBe(true);
  });
});
