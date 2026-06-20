import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/ai-status/route';

describe('GET /api/ai-status', () => {
  const original = process.env;
  beforeEach(() => { process.env = { ...original }; });
  afterEach(() => { process.env = original; });

  it('returns the boolean-only config status envelope', async () => {
    process.env.GEMINI_API_KEY = 'g';
    delete process.env.ANTHROPIC_API_KEY;
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.geminiConfigured).toBe(true);
    expect(body.anthropicConfigured).toBe(false);
    expect(typeof body.authEnabled).toBe('boolean');
  });

  it('does not expose key values', async () => {
    process.env.GEMINI_API_KEY = 'leaky-secret';
    const res = await GET();
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('leaky-secret');
  });
});
