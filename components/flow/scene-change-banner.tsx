'use client';

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
  const bgClass = isExpired
    ? 'bg-red-500/10 border-red-500/20'
    : 'bg-amber-500/10 border-amber-500/20';

  const textClass = isExpired ? 'text-red-300' : 'text-amber-300';

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 border-b ${bgClass}`}
      role="status"
      aria-label="Scene change active"
    >
      <span className="text-sm" aria-hidden="true">&#x1F500;</span>
      <span className={`text-xs ${textClass} flex-1`}>
        {isExpired ? (
          <>Time&apos;s up! Return to <strong className="font-medium">{originalChapterTitle}</strong>?</>
        ) : (
          <>Scene change &mdash; returning to <strong className="font-medium">{originalChapterTitle}</strong> in{' '}
            <span
              className="font-mono font-medium"
              style={{ animation: 'scene-change-pulse 2s ease-in-out infinite' }}
            >
              {formatTime(remainingSeconds)}
            </span>
          </>
        )}
      </span>
      <div className="flex items-center gap-2">
        {!isExpired && extensionsLeft > 0 && (
          <button
            onClick={onExtend}
            className="text-xs text-amber-400/70 hover:text-amber-300 transition-colors px-2 py-0.5 rounded hover:bg-amber-500/10"
          >
            +10 min
          </button>
        )}
        {!isExpired && extensionsLeft === 0 && (
          <span className="text-xs text-sepia-600">(no more extensions)</span>
        )}
        <button
          onClick={onReturn}
          className={`text-xs font-medium px-3 py-1 rounded-lg transition-colors ${
            isExpired
              ? 'bg-wax-700 text-cream-50 hover:bg-red-500'
              : 'text-amber-300 hover:bg-amber-500/20'
          }`}
        >
          Return now
        </button>
      </div>
    </div>
  );
}
