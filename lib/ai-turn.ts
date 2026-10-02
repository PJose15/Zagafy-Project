import { Redis } from '@upstash/redis';
import { err } from '@/lib/api-response';
import { quotaUnavailable } from '@/lib/ai-quota';
import type { AuthedUser } from '@/lib/auth';

/** A metered chat turn allows one call to each helper for three minutes. */
const TTL_SECONDS = 180;
export type AiSidecar = 'state' | 'insight' | 'contradiction' | 'memory';
const localTurns = new Map<string, { userId: string; expires: number; used: Set<AiSidecar> }>();
const configured = () => Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

const CLAIM = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
local ttl = redis.call('TTL', KEYS[1])
if ttl <= 0 then return 0 end
if redis.call('SET', KEYS[2], 'used', 'NX', 'EX', ttl) then return 1 end
return 2
`;

export async function issueAiTurn(user: AuthedUser): Promise<string | null> {
  const id = crypto.randomUUID();
  try {
    if (configured()) {
      const saved = await Redis.fromEnv().set(`aiturn:${id}`, user.userId, { ex: TTL_SECONDS, nx: true });
      return saved === 'OK' ? id : null;
    }
    if (process.env.NODE_ENV === 'production') return null;
    for (const [key, turn] of localTurns) if (turn.expires <= Date.now()) localTurns.delete(key);
    if (localTurns.size >= 1000) return null;
    localTurns.set(id, { userId: user.userId, expires: Date.now() + TTL_SECONDS * 1000, used: new Set() });
    return id;
  } catch {
    return null;
  }
}

export async function enforceAiSidecar(user: AuthedUser, id: string | null, sidecar: AiSidecar, init?: { requestId?: string }) {
  // Local self-hosted development remains usable without a billing backend.
  if (!id && user.embedMode && process.env.NODE_ENV !== 'production') return null;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return err('forbidden', 'A valid chat turn is required for this helper', 403, undefined, init);
  }
  try {
    let claim: number;
    if (configured()) {
      claim = Number(await Redis.fromEnv().eval(CLAIM, [`aiturn:${id}`, `aiturn:${id}:${sidecar}`], [user.userId]));
    } else {
      if (process.env.NODE_ENV === 'production') return quotaUnavailable(init);
      const turn = localTurns.get(id);
      claim = !turn || turn.expires <= Date.now() || turn.userId !== user.userId ? 0 : turn.used.has(sidecar) ? 2 : 1;
      if (claim === 1) turn!.used.add(sidecar);
    }
    if (claim === 1) return null;
    return err('forbidden', claim === 2 ? 'This chat helper has already been used' : 'Chat turn is invalid or expired', 403, undefined, init);
  } catch {
    return quotaUnavailable(init);
  }
}
