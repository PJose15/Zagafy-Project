import type { NextRequest } from 'next/server';

/**
 * Lightweight bot detection layered on top of IP rate limiting. This is a
 * defense-in-depth signal, not a bot management product. Scores are advisory
 * — Phase 2 only logs them. Phase 5 may decide to block at a threshold once
 * authentication context is available.
 *
 * Scoring shape:
 *   <  30   probably human
 *   30–69  suspicious; log only
 *   ≥  70  very likely bot; log + counter
 */

export const BOT_SCORE_LOG_THRESHOLD = 30;

export interface BotSignalResult {
  score: number;
  signals: string[];
}

const BOT_USER_AGENT_RE = /\b(bot|crawler|spider|scraper|crawl)\b/i;
const HEADLESS_TOKENS = [
  'HeadlessChrome',
  'PhantomJS',
  'python-requests',
  'curl/',
  'Wget/',
  'node-fetch',
  'Go-http-client',
  'Java/',
  'okhttp',
  'libwww-perl',
];

const ALLOWED_EMBED_SUFFIXES = ['ai.studio', 'aistudio.google.com'];

function refererIsTrustedEmbed(referer: string | null): boolean {
  if (!referer) return false;
  try {
    const host = new URL(referer).host;
    return ALLOWED_EMBED_SUFFIXES.some(s => host === s || host.endsWith('.' + s));
  } catch {
    return false;
  }
}

export function detectBotSignals(req: NextRequest): BotSignalResult {
  const signals: string[] = [];
  let score = 0;

  const ua = req.headers.get('user-agent');
  const acceptLanguage = req.headers.get('accept-language');
  const acceptEncoding = req.headers.get('accept-encoding');
  const referer = req.headers.get('referer');
  const isApiRoute = req.nextUrl.pathname.startsWith('/api/');

  // ── Missing or self-declared bot UA ──
  if (!ua || ua.trim() === '') {
    signals.push('missing-user-agent');
    score += 50;
  } else {
    if (BOT_USER_AGENT_RE.test(ua)) {
      signals.push('bot-keyword-in-user-agent');
      score += 50;
    }
    if (HEADLESS_TOKENS.some(t => ua.includes(t))) {
      signals.push('headless-or-library-user-agent');
      score += 30;
    }
  }

  // ── Missing common browser headers ──
  if (!acceptLanguage) {
    signals.push('missing-accept-language');
    score += 20;
  }
  if (!acceptEncoding) {
    signals.push('missing-accept-encoding');
    score += 20;
  }

  // ── API call without a referer in production ──
  // Browsers normally send Referer for fetch() to same-origin /api/ paths
  // (subject to Referrer-Policy). A scraper hitting /api/* directly with no
  // referer at all is suspicious — but only in production, since dev tools
  // and curl-from-tests both lack referers legitimately.
  if (
    isApiRoute &&
    process.env.NODE_ENV === 'production' &&
    !referer &&
    !refererIsTrustedEmbed(referer)
  ) {
    signals.push('api-call-no-referer');
    score += 30;
  }

  return { score, signals };
}

export function shouldLogBotSignals(result: BotSignalResult): boolean {
  return result.score >= BOT_SCORE_LOG_THRESHOLD;
}
