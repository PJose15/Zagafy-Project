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

function FlowLoading() {
  const t = useTranslations('flow');
  return <div className="text-sepia-600 text-sm animate-pulse">{t('loadingEditor')}</div>;
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
      <FlowEditor chapterId={session.flowChapterId} onExit={handleExit} />
    </FeatureErrorBoundary>
  );
}
