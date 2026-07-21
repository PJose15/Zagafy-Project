'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Warns the user before navigating away when there are unsaved changes.
 * Uses the browser's beforeunload event for tab close/reload, plus a
 * capture-phase click interceptor for App Router client-side navigation
 * (sidebar Links never fire beforeunload).
 */
export function useUnsavedChanges(hasUnsavedChanges: boolean) {
  const t = useTranslations('unsavedChanges');

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    // Capture phase so this runs before Next's Link onClick (React delegates
    // in the bubble phase). Only plain left-clicks on same-origin, non-download,
    // same-window anchors pointing at a different route are confirmed.
    const clickHandler = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      const anchor = target?.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.hasAttribute('download')) return;
      if (anchor.target && anchor.target !== '_self') return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      if (!window.confirm(t('confirmLeave'))) {
        e.preventDefault();
        // Stop the event before React's delegated Link handler sees it.
        e.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', handler);
    document.addEventListener('click', clickHandler, true);
    return () => {
      window.removeEventListener('beforeunload', handler);
      document.removeEventListener('click', clickHandler, true);
    };
  }, [hasUnsavedChanges, t]);
}
