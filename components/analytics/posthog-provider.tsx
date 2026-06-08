'use client';

import { useEffect, useRef } from 'react';
import { isAnalyticsEnabled, isDoNotTrack, readConsent } from '@/lib/analytics';

/**
 * Phase 5.8 — PostHog client initialization.
 *
 * Renders nothing visible. Initializes posthog-js when:
 * 1. NEXT_PUBLIC_POSTHOG_KEY is set
 * 2. User has granted consent (localStorage)
 * 3. DNT / GPC is not active
 *
 * Session recordings mask all text to protect manuscript content.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    if (!key) return;
    if (isDoNotTrack()) return;
    if (readConsent() !== 'granted') return;

    initRef.current = true;

    import('posthog-js').then((posthogModule) => {
      const posthog = posthogModule.default;
      posthog.init(key, {
        api_host: host || 'https://us.i.posthog.com',
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: false, // We use explicit trackEvent calls
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: '*', // Mask all text — manuscript privacy
        },
        persistence: 'localStorage+cookie',
        respect_dnt: true,
        loaded: (ph) => {
          // In development, enable debug mode for visibility
          if (process.env.NODE_ENV === 'development') {
            ph.debug();
          }
        },
      });
    }).catch(() => {
      // PostHog load failure should never break the app
    });
  }, []);

  return <>{children}</>;
}
