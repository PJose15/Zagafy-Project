import { NextResponse } from 'next/server';
import { err } from '@/lib/api-response';

const EMBED_USER_ID = 'embed-mode';

/** True when the app is running in embed (non-auth) deployment mode. */
export function isEmbedMode(): boolean {
  return process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === 'embed';
}

/** True when Clerk publishable key is present in the environment. */
export function isClerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

/** True when authentication is active (Clerk configured and not in embed mode). */
export function isAuthEnabled(): boolean {
  return isClerkConfigured() && !isEmbedMode();
}

export interface AuthedUser {
  userId: string;
  embedMode: boolean;
}

export type AuthResult = AuthedUser | NextResponse;

/** Type guard: returns true when the auth result is an error response rather than a valid user. */
export function isAuthError(result: AuthResult): result is NextResponse {
  return result instanceof NextResponse;
}

/**
 * Resolve the current user from Clerk, or return an embed-mode stub.
 * Returns a NextResponse (401) when auth is enabled but the user is not signed in.
 */
export async function requireUser(): Promise<AuthResult> {
  if (!isAuthEnabled()) {
    return { userId: EMBED_USER_ID, embedMode: true };
  }

  const { auth } = await import('@clerk/nextjs/server');
  const session = await auth();
  if (!session.userId) {
    return err('unauthorized', 'Sign in required', 401);
  }
  return { userId: session.userId, embedMode: false };
}
