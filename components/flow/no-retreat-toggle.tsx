'use client';

import { Shield } from 'lucide-react';

interface NoRetreatToggleProps {
  active: boolean;
  onToggle: () => void;
}

export function NoRetreatToggle({ active, onToggle }: NoRetreatToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={[
        'relative text-sm transition-all p-1.5 rounded-lg hover:bg-parchment-200 group',
        active ? 'text-wax-500' : 'text-sepia-600',
      ].join(' ')}
      aria-label={active ? 'Disable No-Retreat Mode' : 'Enable No-Retreat Mode'}
      aria-pressed={active}
      title={active ? 'No-Retreat Mode: ON — no deletions allowed' : 'No-Retreat Mode: OFF — click to enable'}
    >
      <Shield size={16} className={active ? 'no-retreat-pulse' : ''} />
    </button>
  );
}
