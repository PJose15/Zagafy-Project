import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getActiveProjectId,
  setActiveProjectId,
  PROJECT_CHANGED_EVENT,
} from '@/lib/projects/active-project';

describe('active-project', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => { storage[k] = v; },
      removeItem: (k: string) => { delete storage[k]; },
      clear: () => { storage = {}; },
      get length() { return Object.keys(storage).length; },
      key: (i: number) => Object.keys(storage)[i] ?? null,
    } as Storage);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('mints and persists a fresh id, stable across reads', () => {
    const id = getActiveProjectId();
    expect(id).toBeTruthy();
    expect(storage['zagafy_active_project']).toBe(id);
    expect(getActiveProjectId()).toBe(id);
  });

  it('adopts the legacy single-project id when present', () => {
    storage['zagafy_project_id'] = 'legacy-123';
    const id = getActiveProjectId();
    expect(id).toBe('legacy-123');
    expect(storage['zagafy_active_project']).toBe('legacy-123');
  });

  it('setActiveProjectId updates both keys and dispatches a same-tab event', () => {
    const handler = vi.fn();
    window.addEventListener(PROJECT_CHANGED_EVENT, handler);

    setActiveProjectId('proj-b');

    expect(storage['zagafy_active_project']).toBe('proj-b');
    expect(storage['zagafy_project_id']).toBe('proj-b');
    expect(handler).toHaveBeenCalledTimes(1);
    const evt = handler.mock.calls[0][0] as CustomEvent;
    expect(evt.detail.projectId).toBe('proj-b');

    window.removeEventListener(PROJECT_CHANGED_EVENT, handler);
  });
});
