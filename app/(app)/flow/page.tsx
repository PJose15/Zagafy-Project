'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useSession } from '@/lib/session';
import { ChapterSelectModal } from '@/components/flow/chapter-select-modal';
import { FeatureErrorBoundary } from '@/components/antiquarian';
import { useRouter } from 'next/navigation';

const FlowEditor = dynamic(
  () => import('@/components/flow/flow-editor').then(m => ({ default: m.FlowEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[150] bg-parchment-200 flex items-center justify-center">
        <FlowLoading />
      </div>
    ),
  }
);

/** Skeleton of the flow editor: top bar + a centered writing column. */
function FlowLoading() {
  const t = useTranslations('flow');
  return (
    <div className="w-full max-w-2xl px-8 animate-pulse" aria-label={t('loadingEditor')}>
      <div className="flex items-center justify-between mb-12">
        <div className="h-3 w-24 rounded bg-sepia-300/40" />
        <div className="h-3 w-16 rounded bg-sepia-300/30" />
      </div>
      <div className="space-y-4">
        <div className="h-4 w-2/5 rounded bg-sepia-300/40" />
        <div className="h-3 w-full rounded bg-sepia-300/30" />
        <div className="h-3 w-11/12 rounded bg-sepia-300/30" />
        <div className="h-3 w-full rounded bg-sepia-300/30" />
        <div className="h-3 w-3/4 rounded bg-sepia-300/30" />
      </div>
      <p className="text-sepia-600 text-sm text-center mt-12">{t('loadingEditor')}</p>
    </div>
  );
}

export default function FlowPage() {
  const t = useTranslations('flow');
  const { session, setFlowChapterId } = useSession();
  const router = useRouter();
  const [showSelect, setShowSelect] = useState(!session.flowChapterId);

  const handleSelectChapter = (chapterId: string) => {
    setFlowChapterId(chapterId);
    setShowSelect(false);
  };

  const handleExit = () => {
    setFlowChapterId(null);
    router.push('/manuscript');
  };

  const handleCloseSelect = () => {
    if (session.flowChapterId) {
      setShowSelect(false);
    } else {
      router.push('/');
    }
  };

  if (showSelect || !session.flowChapterId) {
    return (
      <div className="fixed inset-0 z-[100] bg-mahogany-950">
        <ChapterSelectModal
          onSelect={handleSelectChapter}
          onClose={handleCloseSelect}
        />
      </div>
    );
  }

  return (
    <FeatureErrorBoundary title={t('errorTitle')}>
      {/*
        Key by chapterId so a scene-change depart/return (which swaps
        session.flowChapterId) remounts the editor. This re-seeds `content` from
        the newly-selected chapter (preventing the previous chapter's text from
        being displayed and then autosaved over the new chapter), and lets the
        editor's on-mount effects (pending-return cursor restore + toast,
        expired-scene recovery modal) run on the switch as designed.
      */}
      <FlowEditor
        key={session.flowChapterId}
        chapterId={session.flowChapterId}
        onExit={handleExit}
      />
    </FeatureErrorBoundary>
  );
}
