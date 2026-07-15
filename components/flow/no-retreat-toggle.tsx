'use client';

import { Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface NoRetreatToggleProps {
  active: boolean;
  onToggle: () => void;
}

export function NoRetreatToggle({ active, onToggle }: NoRetreatToggleProps) {
  const t = useTranslations('flow.noRetreatToggle');
  return (
    <button
      onClick={onToggle}
      className={[
        'relative text-sm transition-colors p-1.5 rounded-lg hover:bg-parchment-200 group',
        active ? 'text-wax-500' : 'text-sepia-600',
      ].join(' ')}
      aria-label={active ? t('disable') : t('enable')}
      aria-pressed={active}
      title={active ? t('titleOn') : t('titleOff')}
    >
      <Shield size={16} className={active ? 'no-retreat-pulse' : ''} />
    </button>
  );
}
