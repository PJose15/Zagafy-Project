'use client';

import { useCallback, useEffect, useState } from 'react';
import { listProjects, type ProjectSummary } from '@/lib/projects/projects';
import { getActiveProjectId, PROJECT_CHANGED, PROJECT_CHANGED_EVENT } from '@/lib/projects/active-project';

const SYNC_CHANNEL = 'zagafy_sync';

/**
 * Backs the project library and the sidebar switcher. Tracks the project list
 * and the active id, refreshing on project switches (same-tab + cross-tab) and
 * on story writes (so word/chapter counts stay live).
 */
export function useProjects() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const list = await listProjects();
      setProjects(list);
      setActiveId(getActiveProjectId());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    const onLocalChange = () => refresh();
    window.addEventListener(PROJECT_CHANGED_EVENT, onLocalChange);

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(SYNC_CHANNEL);
        channel.addEventListener('message', (e: MessageEvent) => {
          if (e.data?.type === PROJECT_CHANGED || e.data?.type === 'state-updated') refresh();
        });
      } catch {
        // BroadcastChannel unavailable — single-tab still refreshes on switches.
      }
    }

    return () => {
      window.removeEventListener(PROJECT_CHANGED_EVENT, onLocalChange);
      channel?.close();
    };
  }, [refresh]);

  return { projects, activeId, loading, refresh };
}
