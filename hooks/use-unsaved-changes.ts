'use client';

import { useEffect } from 'react';

/**
 * Warns the user before navigating away when there are unsaved changes.
 * Uses the browser's beforeunload event.
 */
export function useUnsavedChanges(hasUnsavedChanges: boolean) {
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chromium requires returnValue to be set for the leave-site prompt to show.
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);
}
