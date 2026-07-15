'use client';

import { useTranslations } from 'next-intl';

interface XPBarProps {
  level: number;
  current: number;
  needed: number;
  progress: number;
  compact?: boolean;
}

export function XPBar({ level, current, needed, progress, compact = false }: XPBarProps) {
  const t = useTranslations('gamification');
  // M8: Guard NaN — Math.max(0, Math.min(100, NaN)) === NaN
  const safeProgress = Number.isFinite(progress) ? progress : 0;
  const clamped = Math.max(0, Math.min(100, safeProgress));

  return (
    <div className={compact ? 'flex items-center gap-2' : 'space-y-1'}>
      <span className={[
        'font-mono font-semibold shrink-0',
        compact ? 'text-[10px] text-cream-100' : 'text-xs text-sepia-700',
      ].join(' ')}>
        <span aria-label={t('levelAria', { level })}>{t('levelShort', { level })}</span>
      </span>
      {/* M1: Accessible progress bar */}
      <div
        className={[
          'flex-1 rounded-full overflow-hidden',
          compact ? 'h-1.5 bg-mahogany-700/50' : 'h-2 bg-parchment-200/50 border border-sepia-300/20',
        ].join(' ')}
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('levelProgressAria', { level, percent: Math.round(clamped) })}
      >
        <div
          className="h-full bg-gradient-to-r from-brass-600 to-brass-400 rounded-full transition-[width] duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {!compact && (
        <div className="flex justify-between text-[10px] font-mono text-sepia-600">
          <span>{t('xp', { count: Math.max(0, current) })}</span>
          <span>{t('xpToNext', { count: needed })}</span>
        </div>
      )}
    </div>
  );
}
