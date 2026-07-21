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
  // Marketing + legal pages must stay reachable signed-out (pricing before
  // purchase; privacy/terms are a compliance requirement for a paid product).
  '/about(.*)',
  '/blog(.*)',
  '/docs(.*)',
  '/features(.*)',
  '/pricing(.*)',
  '/privacy(.*)',
  '/terms(.*)',
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
 * ── Nonce-based CSP (Phase 7) ──────────────────────────────────────────────
 * The Content-Security-Policy header moved here from next.config.ts so a
 * fresh per-request nonce can replace `'unsafe-inline'` for scripts.
 * Next.js reads the CSP header off the *request* (forwarded via
 * `NextResponse.next({ request: { headers } })`) and stamps the nonce on the
 * inline scripts it emits for streaming/hydration; `'strict-dynamic'` then
 * trusts everything those nonce'd scripts load. Applied to PAGE requests
 * only — /api/* responses are JSON and keep no CSP (unchanged behavior).
 */

export interface CspOptions {
  /** Adds 'unsafe-eval' for React refresh / dev tooling. */
  isDev?: boolean;
  /** Embed mode: frameable by AI Studio hosts instead of 'none'. */
  isEmbed?: boolean;
}

/**
 * Builds the CSP string for a given nonce. Exported for unit tests.
 * All non-script directives are identical to the former next.config.ts CSP,
 * including the embed-aware frame-ancestors allowlist.
 */
export function buildCsp(nonce: string, opts?: CspOptions): string {
  const isDev = opts?.isDev ?? process.env.NODE_ENV === 'development';
  const isEmbed = opts?.isEmbed ?? process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === 'embed';
  const scriptSrc = `'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`;
  const frameAncestors = isEmbed
    ? "'self' https://ai.studio https://*.ai.studio https://aistudio.google.com https://*.google.com"
    : "'none'";
  // Third-party allowances:
  //  - Clerk frontend API (dev instances use *.clerk.accounts.dev; production
  //    instances use clerk.<domain>) + avatar CDN + Cloudflare Turnstile.
  //  - PostHog ingestion + static assets (session recorder runs in a blob:
  //    worker). Without these, enabling auth/analytics hard-breaks sign-in.
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://img.clerk.com",
    "font-src 'self' data:",
    "connect-src 'self' https://generativelanguage.googleapis.com https://*.clerk.accounts.dev https://clerk.zagafy.com https://us.i.posthog.com https://us-assets.i.posthog.com",
    "worker-src 'self' blob:",
    "frame-src 'self' https://challenges.cloudflare.com",
    `frame-ancestors ${frameAncestors}`,
  ].join('; ');
}

/**
 * Generates a nonce, forwards it (plus the CSP) on the request headers so
 * Next.js can stamp its inline scripts, and sets the enforced CSP on the
 * response. Shared by both middleware branches (clerk-wrapped and plain).
 */
export function applyNonceCsp(req: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
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
        return; // API routes: no CSP; let Clerk continue as before.
      }
      if (!isPublicRoute(req)) {
        await auth.protect();
      }
      // Page request — attach the per-request nonce CSP.
      return applyNonceCsp(req);
    }) as unknown as MiddlewareFn)
  : (req: NextRequest): NextResponse => {
      if (isApiRoute(req)) {
        const result = apiPolicy(req);
        if (result) return result;
        return NextResponse.next();
      }
      // Page request — attach the per-request nonce CSP.
      return applyNonceCsp(req);
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
