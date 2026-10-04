/** Local manuscripts belong to this browser. Never auto-sync them to a second account. */
const KEY = 'zagafy_workspace_sync_owner';
const EVENT = 'zagafy:workspace-owner';
export function getWorkspaceOwner(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function subscribeWorkspaceOwner(listener: () => void): () => void {
  window.addEventListener('storage', listener);
  window.addEventListener(EVENT, listener);
  return () => { window.removeEventListener('storage', listener); window.removeEventListener(EVENT, listener); };
}
export function workspaceAllowsSync(userId: string): boolean {
  try {
    const owner = localStorage.getItem(KEY);
    if (owner && owner !== userId) return false;
    if (!owner) {
      localStorage.setItem(KEY, userId);
      window.dispatchEvent(new Event(EVENT));
    }
    return true;
  } catch {
    return false;
  }
}
