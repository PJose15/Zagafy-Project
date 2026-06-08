import { NextResponse } from 'next/server';
import { err } from '@/lib/api-response';

const EMBED_USER_ID = 'embed-mode';

export function isEmbedMode(): boolean {
  return process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === 'embed';
}

export function isClerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
}

export function isAuthEnabled(): boolean {
  return isClerkConfigured() && !isEmbedMode();
}

export interface AuthedUser {
  userId: string;
  embedMode: boolean;
}

export type AuthResult = AuthedUser | NextResponse;

export function isAuthError(result: AuthResult): result is NextResponse {
  return result instanceof NextResponse;
}

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
