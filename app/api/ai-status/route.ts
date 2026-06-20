import { ok } from '@/lib/api-response';
import { getAiConfigStatus } from '@/lib/ai/config-status';

export const runtime = 'nodejs';

/**
 * Cheap, public config probe (boolean-only — no key values, no upstream call).
 * The client uses this to show a clear banner when an AI key/mode is missing
 * instead of letting AI routes fail with silent 500s.
 */
export async function GET() {
  return ok(getAiConfigStatus());
}
