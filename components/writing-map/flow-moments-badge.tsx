'use client';

import { Flame } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface FlowMomentsBadgeProps {
  count: number;
  size?: 'sm' | 'md';
}

export function FlowMomentsBadge({ count, size = 'sm' }: FlowMomentsBadgeProps) {
  const t = useTranslations('writingStats');
  if (count === 0) return null;

  const sizeClasses = size === 'sm'
    ? 'text-xs px-1.5 py-0.5 gap-0.5'
    : 'text-sm px-2 py-1 gap-1';

  const iconSize = size === 'sm' ? 10 : 14;

  return (
    <span
      className={`inline-flex items-center ${sizeClasses} rounded-full bg-brass-300/30 text-brass-800 font-medium`}
      data-testid="flow-moments-badge"
      title={t('flowMomentsDetected', { count })}
    >
      <Flame size={iconSize} className="text-brass-600" />
      {count}
    </span>
  );
}
