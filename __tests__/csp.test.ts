import { describe, it, expect } from 'vitest';
import { buildCsp } from '@/middleware';

// Phase 7: nonce-based CSP builder. Options are passed explicitly so tests
// don't depend on module-load-time env (see middleware.ts CspOptions).

const NONCE = 'dGVzdC1ub25jZQ==';

describe('buildCsp', () => {
  it('includes the nonce and strict-dynamic in script-src (prod)', () => {
    const csp = buildCsp(NONCE, { isDev: false, isEmbed: false });
    expect(csp).toContain(`script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'`);
  });

  it('does NOT include unsafe-inline for scripts in prod mode', () => {
    const csp = buildCsp(NONCE, { isDev: false, isEmbed: false });
    const scriptSrc = csp
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith('script-src'));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("keeps 'unsafe-eval' in dev mode only", () => {
    const dev = buildCsp(NONCE, { isDev: true, isEmbed: false });
    const prod = buildCsp(NONCE, { isDev: false, isEmbed: false });
    expect(dev).toContain("'unsafe-eval'");
    expect(prod).not.toContain("'unsafe-eval'");
  });

  it("uses frame-ancestors 'none' in non-embed (SaaS) mode", () => {
    const csp = buildCsp(NONCE, { isDev: false, isEmbed: false });
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('allowlists AI Studio hosts for frame-ancestors in embed mode', () => {
    const csp = buildCsp(NONCE, { isDev: false, isEmbed: true });
    expect(csp).toContain(
      "frame-ancestors 'self' https://ai.studio https://*.ai.studio https://aistudio.google.com https://*.google.com",
    );
    expect(csp).not.toContain("frame-ancestors 'none'");
  });

  it('preserves all non-script directives from the former static CSP', () => {
    const csp = buildCsp(NONCE, { isDev: false, isEmbed: false });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("font-src 'self' data:");
    expect(csp).toContain(
      "connect-src 'self' https://generativelanguage.googleapis.com",
    );
  });

  it('allows Clerk frontend API, avatars, and Turnstile so sign-in works under CSP', () => {
    const csp = buildCsp(NONCE, { isDev: false, isEmbed: false });
    expect(csp).toContain('https://*.clerk.accounts.dev');
    expect(csp).toContain('https://img.clerk.com');
    expect(csp).toContain("frame-src 'self' https://challenges.cloudflare.com");
  });

  it('allows PostHog ingestion/assets and blob workers for session recording', () => {
    const csp = buildCsp(NONCE, { isDev: false, isEmbed: false });
    expect(csp).toContain('https://us.i.posthog.com');
    expect(csp).toContain('https://us-assets.i.posthog.com');
    expect(csp).toContain("worker-src 'self' blob:");
  });

  it('embeds different nonces verbatim', () => {
    const other = 'YW5vdGhlcg==';
    expect(buildCsp(other, { isDev: false, isEmbed: false })).toContain(
      `'nonce-${other}'`,
    );
  });
});
