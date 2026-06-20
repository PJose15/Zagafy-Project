'use client';

import { useEffect, useState } from 'react';
import type { AiConfigStatus } from '@/lib/ai/config-status';

/**
 * Fetches the boolean-only AI config status once on mount. Returns null until
 * loaded (or on failure). Used to surface a clear banner / inline message when
 * a required key or auth mode would make AI routes fail.
 */
export function useAiStatus(): AiConfigStatus | null {
  const [status, setStatus] = useState<AiConfigStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ai-status')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        // The ok() envelope flattens data to the top level and nests it under `data`.
        const s = (d?.data ?? d) as AiConfigStatus;
        if (s && typeof s.geminiConfigured === 'boolean') setStatus(s);
      })
      .catch(() => {
        // Status unknown — show nothing rather than a false alarm.
      });
    return () => { cancelled = true; };
  }, []);

  return status;
}
