import { NextRequest, NextResponse } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { detectBotSignals, shouldLogBotSignals } from '@/lib/bot-signals';
import { isAuthEnabled } from '@/lib/auth';

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

const isApiRoute = createRouteMatcher(['/api/(.*)']);
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/health(.*)',
  '/api/ai-status(.*)', // boolean-only config probe — must be readable when signed out
  '/api/webhooks/(.*)', // Clerk / Stripe webhooks — verified by HMAC signature
]);

function isAllowedEmbedHost(host: string): boolean {
  return ALLOWED_EMBED_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith('.' + suffix),
  );
}

function logCorsDeny(req: NextRequest, reason: DenyReason): void {
  // Structured log only. We deliberately exclude any user PII beyond IP and
  // user-agent, which are routinely captured by Vercel anyway.
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
 * CORS + bot-signal policy applied to every /api/* request. Returns a deny
 * response when the request fails the origin/referer allowlist; null when
 * the request should proceed.
 */
function apiPolicy(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');

  logBotSignalsIfSuspicious(req);

  if (!origin && !referer) return null;

  const host = req.headers.get('host') || '';

  if (process.env.NODE_ENV === 'development' && origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') {
        return null;
      }
    } catch {
      // fall through to invalid-origin handling
    }
  }

  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host || isAllowedEmbedHost(originHost)) return null;
    } catch {
      return denied(req, 'invalid-origin-url');
    }
  }

  if (referer) {
    try {
      const refererHost = new URL(referer).host;
      if (refererHost === host || isAllowedEmbedHost(refererHost)) return null;
    } catch {
      return denied(req, 'invalid-referer-url');
    }
  }

  return denied(req, 'origin-and-referer-not-in-allowlist');
}

/**
 * In SaaS mode (Clerk configured + not embed) we wrap with `clerkMiddleware`
 * so `auth.protect()` redirects unauthenticated users on protected routes.
 * In embed mode or when Clerk is unconfigured we run only the CORS + bot
 * policy on /api/* and pass everything else through unchanged — preserving
 * the AI Studio applet's auth-free behavior.
 *
 * The unified call signature `(req) => NextResponse | Promise<...>` lets
 * tests call `middleware(req)` directly; Next.js still passes the optional
 * NextFetchEvent at runtime, which both branches happily ignore.
 */
type MiddlewareFn = (req: NextRequest) => NextResponse | Response | Promise<NextResponse | Response | undefined>;

const middlewareImpl: MiddlewareFn = isAuthEnabled()
  ? (clerkMiddleware(async (auth, req) => {
      if (isApiRoute(req)) {
        const result = apiPolicy(req);
        if (result) return result;
      }
      if (!isPublicRoute(req)) {
        await auth.protect();
      }
    }) as unknown as MiddlewareFn)
  : (req: NextRequest): NextResponse => {
      if (isApiRoute(req)) {
        const result = apiPolicy(req);
        if (result) return result;
      }
      return NextResponse.next();
    };

export default middlewareImpl;
// Named export retained so existing CORS / bot-signal tests that import
// `{ middleware }` keep working without rewriting the import shape.
export const middleware = middlewareImpl;

export const config = {
  matcher: [
    // Run on every route except Next.js internals and common static assets,
    // so Clerk can enforce auth on page navigations as well as API calls.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
