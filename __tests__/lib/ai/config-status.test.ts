import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAiConfigStatus } from '@/lib/ai/config-status';

describe('getAiConfigStatus', () => {
  const original = process.env;
  beforeEach(() => { process.env = { ...original }; });
  afterEach(() => { process.env = original; });

  it('reports gemini/anthropic key presence as booleans', () => {
    process.env.GEMINI_API_KEY = 'g';
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    const s = getAiConfigStatus();
    expect(s.geminiConfigured).toBe(true);
    expect(s.anthropicConfigured).toBe(false);
    expect(s.authEnabled).toBe(false);
  });

  it('reports anthropic configured when its key is present', () => {
    process.env.ANTHROPIC_API_KEY = 'a';
    expect(getAiConfigStatus().anthropicConfigured).toBe(true);
  });

  it('authEnabled is true only when Clerk is configured and not in embed mode', () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test';
    delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
    expect(getAiConfigStatus().authEnabled).toBe(true);

    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = 'embed';
    expect(getAiConfigStatus().authEnabled).toBe(false);

    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE;
    expect(getAiConfigStatus().authEnabled).toBe(false);
  });

  it('never leaks key values — only booleans', () => {
    process.env.GEMINI_API_KEY = 'super-secret';
    const s = getAiConfigStatus();
    expect(JSON.stringify(s)).not.toContain('super-secret');
  });
});
