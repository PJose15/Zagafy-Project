import { NextRequest, NextResponse } from 'next/server';
import { detectBotSignals, shouldLogBotSignals } from '@/lib/bot-signals';

/**
 * Hosts allowed to make cross-origin API calls to this app.
 * Google AI Studio embeds the applet in an iframe where the effective
 * Origin becomes ai.studio (or aistudio.google.com), so same-origin
 * checks would otherwise reject every extraction / chat call.
 */
const ALLOWED_EMBED_SUFFIXES = [
  'ai.studio',
  'aistudio.google.com',
];

type DenyReason =
  | 'invalid-origin-url'
  | 'invalid-referer-url'
  | 'origin-and-referer-not-in-allowlist';

function isAllowedEmbedHost(host: string): boolean {
  return ALLOWED_EMBED_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith('.' + suffix),
  );
}

function logCorsDeny(req: NextRequest, reason: DenyReason): void {
  // Structured log only. We deliberately exclude any user PII beyond IP and
  // user-agent, which are routinely captured by Vercel anyway. This shape will
  // feed Sentry breadcrumbs when SG-01 / Sentry land in Phase 5.
  const entry = {
    level: 'warn',
    event: 'cors_deny',
    timestamp: new Date().toISOString(),
    pathname: req.nextUrl.pathname,
    origin: req.headers.get('origin'),
    referer: req.headers.get('referer'),
    host: req.headers.get('host'),
    ip: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip'),
    userAgent: req.headers.get('user-agent'),
    reason,
  };
  console.warn('[CORS] Denied', entry);
}

function denied(req: NextRequest, reason: DenyReason): NextResponse {
  logCorsDeny(req, reason);
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

function logBotSignalsIfSuspicious(req: NextRequest): void {
  const result = detectBotSignals(req);
  if (!shouldLogBotSignals(result)) return;
  console.warn('[bot-signals] Suspicious request', {
    level: 'warn',
    event: 'bot_signals',
    timestamp: new Date().toISOString(),
    pathname: req.nextUrl.pathname,
    score: result.score,
    signals: result.signals,
    ip: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip'),
    userAgent: req.headers.get('user-agent'),
  });
}

/**
 * Protect API routes from cross-origin abuse.
 * Allows requests from the same origin (checked via Origin or Referer header),
 * from allowlisted embed hosts (AI Studio), and server-side requests (no
 * Origin header, e.g. Next.js SSR).
 */
export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');

  // Score bot signals on every request that reaches API middleware. We log
  // suspicious requests but do not block — the rate limiter is the gate.
  // Phase 5 may decide to deny over a threshold once auth context exists.
  logBotSignalsIfSuspicious(req);

  // Server-side or same-origin requests without Origin header are allowed
  if (!origin && !referer) {
    return NextResponse.next();
  }

  const host = req.headers.get('host') || '';

  // Localhost in development is always allowed (dev convenience). We check
  // this BEFORE the allowlist comparison so dev tooling on a different port
  // never gets logged as a denial.
  if (process.env.NODE_ENV === 'development' && origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') {
        return NextResponse.next();
      }
    } catch {
      // fall through to invalid-origin handling
    }
  }

  // Check Origin header
  let originHost: string | null = null;
  if (origin) {
    try {
      originHost = new URL(origin).host;
      if (originHost === host || isAllowedEmbedHost(originHost)) {
        return NextResponse.next();
      }
    } catch {
      return denied(req, 'invalid-origin-url');
    }
  }

  // Fallback: check Referer header
  if (referer) {
    try {
      const refererHost = new URL(referer).host;
      if (refererHost === host || isAllowedEmbedHost(refererHost)) {
        return NextResponse.next();
      }
    } catch {
      return denied(req, 'invalid-referer-url');
    }
  }

  return denied(req, 'origin-and-referer-not-in-allowlist');
}

export const config = {
  matcher: '/api/:path*',
};
