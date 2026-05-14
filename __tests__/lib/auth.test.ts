import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextResponse } from 'next/server';

const originalEnv = { ...process.env };

const mockAuth = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

async function freshAuthModule() {
  vi.resetModules();
  return import('@/lib/auth');
}

describe('lib/auth', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
    mockAuth.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('isAuthEnabled', () => {
    it('false when Clerk key missing', async () => {
      const auth = await freshAuthModule();
      expect(auth.isAuthEnabled()).toBe(false);
    });

    it('false when key set but DEPLOYMENT_MODE=embed', async () => {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_xxx';
      process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = 'embed';
      const auth = await freshAuthModule();
      expect(auth.isAuthEnabled()).toBe(false);
    });

    it('true when key set and mode is not embed', async () => {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_xxx';
      const auth = await freshAuthModule();
      expect(auth.isAuthEnabled()).toBe(true);
    });

    it('true when key set and mode explicitly saas', async () => {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_xxx';
      process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = 'saas';
      const auth = await freshAuthModule();
      expect(auth.isAuthEnabled()).toBe(true);
    });
  });

  describe('requireUser', () => {
    it('returns synthetic embed user when auth disabled', async () => {
      const auth = await freshAuthModule();
      const result = await auth.requireUser();
      expect(auth.isAuthError(result)).toBe(false);
      if (!auth.isAuthError(result)) {
        expect(result.userId).toBe('embed-mode');
        expect(result.embedMode).toBe(true);
      }
      expect(mockAuth).not.toHaveBeenCalled();
    });

    it('returns 401 when auth enabled and no session', async () => {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_xxx';
      mockAuth.mockResolvedValue({ userId: null });
      const auth = await freshAuthModule();
      const result = await auth.requireUser();
      expect(auth.isAuthError(result)).toBe(true);
      if (auth.isAuthError(result)) {
        expect(result.status).toBe(401);
        const body = await result.json();
        expect(body.code).toBe('unauthorized');
      }
    });

    it('returns Clerk user when auth enabled and session present', async () => {
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_xxx';
      mockAuth.mockResolvedValue({ userId: 'user_abc123' });
      const auth = await freshAuthModule();
      const result = await auth.requireUser();
      expect(auth.isAuthError(result)).toBe(false);
      if (!auth.isAuthError(result)) {
        expect(result.userId).toBe('user_abc123');
        expect(result.embedMode).toBe(false);
      }
    });
  });

  describe('isAuthError', () => {
    it('discriminates NextResponse from AuthedUser', async () => {
      const auth = await freshAuthModule();
      expect(auth.isAuthError({ userId: 'x', embedMode: true })).toBe(false);
      expect(auth.isAuthError(NextResponse.json({}, { status: 401 }))).toBe(true);
    });
  });
});
