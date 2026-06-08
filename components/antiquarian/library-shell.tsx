'use client';

import { useCallback, useEffect, useRef } from 'react';
import { MotionConfig } from 'motion/react';
import { StoryProvider } from '@/lib/store';
import { SessionProvider } from '@/lib/session';
import { ToastProvider, useToast } from '@/components/antiquarian/antiquarian-toast';
import { ConfirmProvider } from '@/components/antiquarian/parchment-modal';
import { ParchmentSidebar } from '@/components/antiquarian/parchment-sidebar';
import { DiagnosticGate } from '@/components/diagnostic/diagnostic-gate';
import { useSessionTracker } from '@/hooks/use-session-tracker';
import { FlowScoreModal } from '@/components/writing-map/flow-score-modal';
import { updateSessionFlowScore } from '@/lib/types/writing-session';
import type { FlowScore } from '@/lib/types/writing-session';
import { readGamification } from '@/lib/types/gamification';
import { getStreakWarning } from '@/lib/gamification/writing-streak';
import { GamificationProvider } from '@/hooks/use-gamification';
import { SyncProvider } from '@/lib/sync/sync-context';

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

  const handleFlowSubmit = useCallback((sessionId: string, score: FlowScore) => {
    updateSessionFlowScore(sessionId, score).catch(() => { /* best effort */ });
    dismissFlowScore();
  }, [dismissFlowScore]);

  return (
    <>
      <StreakWarningToast />
      <ParchmentSidebar />
      <main
        id="main-content"
        className="flex-1 overflow-y-auto md:rounded-tl-3xl border-t md:border-t-0 md:border-l border-mahogany-700/30 relative"
      >
        <DiagnosticGate>{children}</DiagnosticGate>
      </main>
      {pendingFlowScore && (
        <FlowScoreModal
          sessionId={pendingFlowScore.sessionId}
          onSubmit={handleFlowSubmit}
          onDismiss={dismissFlowScore}
        />
      )}
    </>
  );
}

export function LibraryShell({ children }: { children: React.ReactNode }) {
  const syncEnabled =
    Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'embed';
  return (
    <SyncProvider enabled={syncEnabled}>
      <StoryProvider>
        <SessionProvider>
          <GamificationProvider>
            <MotionConfig reducedMotion="user">
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
