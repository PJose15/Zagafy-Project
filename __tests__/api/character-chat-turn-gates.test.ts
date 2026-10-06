import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
const { claim } = vi.hoisted(() => ({ claim: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ userId: 'user-a', embedMode: false }), isAuthError: () => false }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => null }));
vi.mock('@upstash/redis', () => ({ Redis: { fromEnv: () => ({ eval: claim }) } }));
import { POST as state } from '@/app/api/character-chat/state/route';
import { POST as insight } from '@/app/api/character-chat/insight/route';
import { POST as contradiction } from '@/app/api/character-chat/contradiction/route';
import { POST as memory } from '@/app/api/character-chat/memory/route';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('all paid helper routes require a main-turn authorization', () => {
  it.each([state, insight, contradiction, memory])('rejects direct requests before any provider call', async post => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const response = await post(new NextRequest('http://localhost/api/character-chat/helper', { method: 'POST', body: '{}' }));
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });
  it.each([state, insight, contradiction, memory])('rejects replayed claims before provider calls', async post => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test');
    claim.mockResolvedValue(2);
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const response = await post(new NextRequest('http://localhost/api/character-chat/helper', { method: 'POST', body: '{}', headers: { 'X-AI-Turn-ID': '75ff04e9-6fd0-43a1-88c8-e27b29ce9c59' } }));
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
});
