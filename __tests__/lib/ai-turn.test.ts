import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { set, evalClaim } = vi.hoisted(() => ({ set: vi.fn(), evalClaim: vi.fn() }));
vi.mock('@upstash/redis', () => ({ Redis: { fromEnv: () => ({ set, eval: evalClaim }) } }));
import { issueAiTurn, enforceAiSidecar } from '@/lib/ai-turn';

const user = { userId: 'user-a', embedMode: false };
const id = '75ff04e9-6fd0-43a1-88c8-e27b29ce9c59';
beforeEach(() => { vi.clearAllMocks(); set.mockResolvedValue('OK'); evalClaim.mockResolvedValue(1); });
afterEach(() => vi.unstubAllEnvs());
function production() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://test.upstash.io');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test');
}

describe('chat turn helper grants', () => {
  it('binds an unpredictable expiring grant to the authenticated user', async () => {
    production();
    const grant = await issueAiTurn(user);
    expect(grant).toMatch(/^[\da-f-]{36}$/);
    expect(set).toHaveBeenCalledWith(`aiturn:${grant}`, 'user-a', { ex: 180, nx: true });
  });
  it('uses one atomic user-bound claim per helper', async () => {
    production();
    expect(await enforceAiSidecar(user, id, 'memory')).toBeNull();
    expect(evalClaim).toHaveBeenCalledWith(expect.stringContaining("redis.call('SET'"), [`aiturn:${id}`, `aiturn:${id}:memory`], ['user-a']);
  });
  it('rejects missing and malformed grants without Redis or provider work', async () => {
    production();
    for (const grant of [null, 'made-up']) expect((await enforceAiSidecar(user, grant, 'state'))?.status).toBe(403);
    expect(evalClaim).not.toHaveBeenCalled();
  });
  it.each([0, 2])('rejects expired/wrong-user and replayed claims (%i)', async (claim) => {
    production(); evalClaim.mockResolvedValue(claim);
    expect((await enforceAiSidecar(user, id, 'insight'))?.status).toBe(403);
  });
  it('fails closed on Redis errors and missing production configuration', async () => {
    production(); evalClaim.mockRejectedValue(new Error('timeout'));
    expect((await enforceAiSidecar(user, id, 'state'))?.status).toBe(503);
    set.mockRejectedValue(new Error('timeout'));
    expect(await issueAiTurn(user)).toBeNull();
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    expect(await issueAiTurn(user)).toBeNull();
    expect((await enforceAiSidecar(user, id, 'state'))?.status).toBe(503);
  });
  it('local grants reject another user, concurrent replay, and expiry', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    const grant = await issueAiTurn(user);
    expect((await enforceAiSidecar({ ...user, userId: 'user-b' }, grant, 'state'))?.status).toBe(403);
    const results = await Promise.all([enforceAiSidecar(user, grant, 'state'), enforceAiSidecar(user, grant, 'state')]);
    expect(results.filter(x => x === null)).toHaveLength(1);
    expect(await enforceAiSidecar(user, grant, 'insight')).toBeNull();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 181_000);
    expect((await enforceAiSidecar(user, grant, 'memory'))?.status).toBe(403);
    vi.restoreAllMocks();
  });
});
