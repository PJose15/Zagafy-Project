/**
 * Multi-project support — the "active project" pointer.
 *
 * Which project the app is currently showing is a single value in
 * localStorage. Every Dexie table that holds per-story data is scoped by this
 * id. Keep this module dependency-free (only localStorage + BroadcastChannel)
 * so the storage layer can import it without a cycle.
 */

const ACTIVE_KEY = 'zagafy_active_project';
/**
 * Legacy single-project key. Pre-multi-project builds minted one uuid here and
 * tagged every writing session with it, so we adopt it as the first project's
 * id — existing sessions then backfill onto the right project for free.
 */
const LEGACY_KEY = 'zagafy_project_id';

const SYNC_CHANNEL = 'zagafy_sync';

export const PROJECT_CHANGED = 'project-changed';
/** Same-tab DOM event — BroadcastChannel does not deliver to the posting tab. */
export const PROJECT_CHANGED_EVENT = 'zagafy:project-changed';

function safeUUID(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Extremely defensive — crypto.randomUUID is available in all target envs.
    return `proj-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}

/**
 * Resolve the active project id. Falls back to the legacy single-project id,
 * then mints a fresh one. Persists whatever it resolves so the value is stable
 * across reads. Safe to call in non-browser contexts (returns a transient id).
 */
export function getActiveProjectId(): string {
  if (typeof localStorage === 'undefined') return 'current';
  try {
    const active = localStorage.getItem(ACTIVE_KEY);
    if (active && active.length > 0) return active;

    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy && legacy.length > 0) {
      localStorage.setItem(ACTIVE_KEY, legacy);
      return legacy;
    }

    const fresh = safeUUID();
    localStorage.setItem(ACTIVE_KEY, fresh);
    localStorage.setItem(LEGACY_KEY, fresh);
    return fresh;
  } catch {
    return 'current';
  }
}

/**
 * Switch the active project and notify other tabs (and this tab's store) so
 * they re-hydrate. Also mirrors into the legacy key so session/braindump
 * tagging follows the active project.
 */
export function setActiveProjectId(id: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_KEY, id);
    localStorage.setItem(LEGACY_KEY, id);
  } catch {
    // Ignore — quota/availability failures are non-fatal.
  }
  broadcastProjectChanged(id);
}

/** Notify other tabs (BroadcastChannel) and this tab (DOM event) of the switch. */
export function broadcastProjectChanged(id: string): void {
  // Same-tab listeners (the store in this tab) — BroadcastChannel won't reach us.
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent(PROJECT_CHANGED_EVENT, { detail: { projectId: id } }));
    } catch {
      // Ignore — environments without CustomEvent fall back to nothing.
    }
  }
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(SYNC_CHANNEL);
    channel.postMessage({ type: PROJECT_CHANGED, projectId: id, at: Date.now() });
    channel.close();
  } catch {
    // BroadcastChannel unavailable — single-tab still works via local re-hydrate.
  }
}
