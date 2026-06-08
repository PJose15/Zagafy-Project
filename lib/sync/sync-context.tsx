'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { SyncEngine } from './sync-engine';
import type { SyncStatus, ConflictRecord, SyncEvent } from './types';

interface SyncContextType {
  /** Current sync engine status. */
  status: SyncStatus;
  /** Unresolved conflicts from the last push. */
  conflicts: ConflictRecord[];
  /** Notify the engine that a local write occurred (triggers debounced push). */
  notifyWrite: () => void;
  /** Force an immediate sync cycle. */
  syncNow: () => Promise<void>;
  /** True when sync is available (auth + DB configured). */
  enabled: boolean;
}

const SyncContext = createContext<SyncContextType>({
  status: 'disabled',
  conflicts: [],
  notifyWrite: () => {},
  syncNow: async () => {},
  enabled: false,
});

interface SyncProviderProps {
  children: React.ReactNode;
  /** Whether auth is enabled and database is configured. */
  enabled: boolean;
}

export function SyncProvider({ children, enabled }: SyncProviderProps) {
  const [status, setStatus] = useState<SyncStatus>('disabled');
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const engineRef = useRef<SyncEngine | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const engine = new SyncEngine();
    engineRef.current = engine;

    const unsub = engine.subscribe((event: SyncEvent) => {
      switch (event.type) {
        case 'status-change':
          setStatus(event.status);
          break;
        case 'push-complete':
          if (event.conflicts.length > 0) {
            setConflicts(event.conflicts);
          }
          break;
        case 'pull-complete':
          // Pull complete -- UI will re-render from Dexie
          break;
        case 'error':
          console.warn('[sync]', event.message);
          break;
      }
    });

    // Listen for online/offline
    const handleOnline = () => {
      if (engine.getStatus() === 'offline') {
        engine.syncNow().catch(() => {});
      }
    };
    const handleOffline = () => {
      setStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    engine.start().catch(() => {});

    return () => {
      unsub();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      engine.destroy();
      engineRef.current = null;
    };
  }, [enabled]);

  const notifyWrite = useCallback(() => {
    engineRef.current?.notifyWrite();
  }, []);

  const syncNow = useCallback(async () => {
    await engineRef.current?.syncNow();
  }, []);

  return (
    <SyncContext.Provider value={{ status, conflicts, notifyWrite, syncNow, enabled }}>
      {children}
    </SyncContext.Provider>
  );
}

/** Access sync engine status and controls. */
export function useSync() {
  return useContext(SyncContext);
}
