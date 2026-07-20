'use client';

import { useCallback, useEffect, useRef } from 'react';
import { MotionConfig } from 'motion/react';
import { StoryProvider } from '@/lib/store';
import { SessionProvider } from '@/lib/session';
import { ToastProvider, useToast } from '@/components/antiquarian/antiquarian-toast';
import { ConfirmProvider } from '@/components/antiquarian/parchment-modal';
import { ParchmentSidebar } from '@/components/antiquarian/parchment-sidebar';
import { BackToTop } from '@/components/antiquarian/back-to-top';
import { CardCatalog } from '@/components/catalog/card-catalog';
import { ShortcutsSheet } from '@/components/catalog/shortcuts-sheet';
import { LevelUpCeremony } from '@/components/gamification/level-up-ceremony';
import { RouteTitle } from '@/components/antiquarian/route-title';
import { DiagnosticGate } from '@/components/diagnostic/diagnostic-gate';
import { useSessionTracker } from '@/hooks/use-session-tracker';
import { useWordMilestones } from '@/hooks/use-word-milestones';
import { FlowScoreModal } from '@/components/writing-map/flow-score-modal';
import { updateSessionFlowScore } from '@/lib/types/writing-session';
import type { FlowScore } from '@/lib/types/writing-session';
import { readGamification } from '@/lib/types/gamification';
import { getStreakWarning } from '@/lib/gamification/writing-streak';
import { GamificationProvider } from '@/hooks/use-gamification';
import { SyncProvider } from '@/lib/sync/sync-context';
import { OnboardingTour } from '@/components/onboarding/onboarding-tour';
import { AiStatusBanner } from '@/components/ai/ai-status-banner';
import { useProfile } from '@/hooks/use-profile';

function StreakWarningToast() {
  const { toast } = useToast();
  const shownRef = useRef(false);
  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    try {
      const gam = readGamification();
      const warning = getStreakWarning(gam.streak, new Date().getHours());
      if (warning) toast(warning, 'warning');
    } catch { /* ignore */ }
  }, [toast]);
  return null;
}

function LibraryShellInner({ children }: { children: React.ReactNode }) {
  const { pendingFlowScore, dismissFlowScore } = useSessionTracker();
  // A4: gold moments when the manuscript crosses a round word count.
  useWordMilestones();

  const handleFlowSubmit = useCallback((sessionId: string, score: FlowScore) => {
    updateSessionFlowScore(sessionId, score).catch(() => { /* best effort */ });
    dismissFlowScore();
  }, [dismissFlowScore]);

  return (
    <>
      <RouteTitle />
      <StreakWarningToast />
      <ParchmentSidebar />
      <main
        id="main-content"
        className="flex-1 overflow-y-auto md:rounded-tl-3xl border-t md:border-t-0 md:border-l border-mahogany-700/30 relative"
      >
        <AiStatusBanner />
        {/* Desk vignette — pinned to the viewport, never intercepts input */}
        <div aria-hidden="true" className="print:hidden pointer-events-none sticky top-0 z-30 h-0">
          <div className="h-screen w-full desk-vignette" />
        </div>
        <DiagnosticGate>{children}</DiagnosticGate>
      </main>
      {pendingFlowScore && (
        <FlowScoreModal
          sessionId={pendingFlowScore.sessionId}
          onSubmit={handleFlowSubmit}
          onDismiss={dismissFlowScore}
        />
      )}
      <BackToTop />
      <CardCatalog />
      <ShortcutsSheet />
      <LevelUpCeremony />
      <OnboardingTour />
    </>
  );
}

export function LibraryShell({ children }: { children: React.ReactNode }) {
  const { profile } = useProfile();
  const syncEnabled =
    Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'embed';
  // I18nProvider + ConsentBanner moved to the root layout (S1-I04) so
  // marketing/auth pages get them without mounting this heavy shell.
  return (
    <SyncProvider enabled={syncEnabled}>
      <StoryProvider>
        <SessionProvider>
          <GamificationProvider>
            <MotionConfig reducedMotion={profile?.preferences.reducedMotion ? 'always' : 'user'}>
              <ToastProvider>
                <ConfirmProvider>
                  <LibraryShellInner>{children}</LibraryShellInner>
                </ConfirmProvider>
              </ToastProvider>
            </MotionConfig>
          </GamificationProvider>
        </SessionProvider>
      </StoryProvider>
    </SyncProvider>
  );
}
