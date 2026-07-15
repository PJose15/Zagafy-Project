'use client';

import { useTranslations } from 'next-intl';
import { Shuffle } from 'lucide-react';

interface SceneChangeBannerProps {
  originalChapterTitle: string;
  remainingSeconds: number;
  isExpired: boolean;
  extensionsLeft: number;
  onReturn: () => void;
  onExtend: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function SceneChangeBanner({
  originalChapterTitle,
  remainingSeconds,
  isExpired,
  extensionsLeft,
  onReturn,
  onExtend,
}: SceneChangeBannerProps) {
  const t = useTranslations('flow.sceneChangeBanner');
  const bgClass = isExpired
    ? 'bg-wax-500/10 border-wax-500/20'
    : 'bg-brass-500/10 border-brass-500/20';

  const textClass = isExpired ? 'text-wax-500' : 'text-brass-300';

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 border-b ${bgClass}`}
      role="status"
      aria-label={t('ariaLabel')}
    >
      <Shuffle size={14} aria-hidden="true" className={textClass} />
      <span className={`text-xs ${textClass} flex-1`}>
        {isExpired ? (
          t.rich('expired', {
            title: originalChapterTitle,
            b: (chunks) => <strong className="font-medium">{chunks}</strong>,
          })
        ) : (
          t.rich('active', {
            title: originalChapterTitle,
            seconds: formatTime(remainingSeconds),
            b: (chunks) => <strong className="font-medium">{chunks}</strong>,
            clock: (chunks) => (
              <span
                className="font-mono font-medium"
                style={{ animation: 'scene-change-pulse 2s ease-in-out infinite' }}
              >
                {chunks}
              </span>
            ),
          })
        )}
      </span>
      <div className="flex items-center gap-2">
        {!isExpired && extensionsLeft > 0 && (
          <button
            onClick={onExtend}
            className="text-xs text-brass-400/70 hover:text-brass-300 transition-colors px-2 py-0.5 rounded hover:bg-brass-500/10"
          >
            {t('extend')}
          </button>
        )}
        {!isExpired && extensionsLeft === 0 && (
          <span className="text-xs text-sepia-600">{t('noExtensions')}</span>
        )}
        <button
          onClick={onReturn}
          className={`text-xs font-medium px-3 py-1 rounded-lg transition-colors ${
            isExpired
              ? 'bg-wax-700 text-cream-50 hover:bg-wax-600'
              : 'text-brass-300 hover:bg-brass-500/20'
          }`}
        >
          {t('returnNow')}
        </button>
      </div>
    </div>
  );
}
