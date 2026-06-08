'use client';

import { useCallback } from 'react';
import { useAnalyticsConsent } from '@/hooks/use-analytics-consent';

/**
 * Phase 5.8 — GDPR-ready analytics consent banner.
 *
 * Shows on first visit when NEXT_PUBLIC_POSTHOG_KEY is configured and
 * the user hasn't made a choice yet. Automatically hides when DNT/GPC
 * is active (treated as "denied"). Choice persists in localStorage.
 */
export function ConsentBanner() {
  const { consent, dnt, setConsent } = useAnalyticsConsent();

  const handleAccept = useCallback(() => {
    setConsent('granted');
    // Reload to initialize PostHog with consent
    window.location.reload();
  }, [setConsent]);

  const handleDecline = useCallback(() => {
    setConsent('denied');
  }, [setConsent]);

  // Hide when: no PostHog key, DNT active, or user already chose
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return null;
  if (dnt) return null;
  if (consent !== 'pending') return null;

  return (
    <div
      role="dialog"
      aria-label="Analytics consent"
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50 bg-parchment-100 border border-sepia-300/60 rounded-xl shadow-xl p-4 space-y-3"
    >
      <p className="text-sm text-sepia-800 leading-relaxed">
        We use privacy-friendly analytics to understand how Zagafy is used and improve
        the experience. No manuscript content is ever collected. You can change this
        anytime in Settings.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={handleAccept}
          className="px-4 py-1.5 rounded-lg bg-brass-600 text-cream-50 text-sm font-medium hover:bg-brass-700 transition-colors"
        >
          Accept
        </button>
        <button
          onClick={handleDecline}
          className="px-4 py-1.5 rounded-lg border border-sepia-300/60 text-sepia-700 text-sm font-medium hover:bg-parchment-200 transition-colors"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
