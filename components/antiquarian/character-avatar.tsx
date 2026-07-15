'use client';

import type { CharacterState } from '@/lib/store';

const AVATAR_COLORS = [
  '#6b3e25', // mahogany
  '#166534', // forest
  '#a88540', // brass
  '#5a3d1e', // sepia-dark
  '#991b1b', // wax-deep
  '#4a2c1a', // mahogany-dark
  '#8b6b38', // brass-warm
  '#0d2818', // forest-deep
];

const INDICATOR_COLORS: Record<NonNullable<CharacterState['indicator']>, string> = {
  'stable': '#166534',
  'shifting': '#c49b48',
  'under pressure': '#b91c1c',
  'emotionally conflicted': '#991b1b',
  'at risk of contradiction': '#dc2626',
};

const SIZE_MAP = {
  sm: { outer: 28, text: '10px', dot: 7 },
  md: { outer: 36, text: '13px', dot: 8 },
  lg: { outer: 48, text: '16px', dot: 10 },
  xl: { outer: 64, text: '22px', dot: 12 },
};

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

interface CharacterAvatarProps {
  name: string;
  indicator?: CharacterState['indicator'];
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function CharacterAvatar({ name, indicator, size = 'md', className = '' }: CharacterAvatarProps) {
  const color = AVATAR_COLORS[hashName(name) % AVATAR_COLORS.length];
  const initials = getInitials(name);
  const s = SIZE_MAP[size];
  // Indicator is AI-written and can be non-enum prose; only show the dot for
  // recognized values so we never index INDICATOR_COLORS with a junk key.
  const showDot = indicator && indicator !== 'stable' && indicator in INDICATOR_COLORS;

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 rounded-full border-2 border-parchment-200 ${className}`}
      style={{
        width: s.outer,
        height: s.outer,
        backgroundColor: color,
      }}
      title={name}
    >
      <span
        className="font-serif font-semibold text-cream-50 leading-none select-none"
        style={{ fontSize: s.text }}
      >
        {initials}
      </span>
      {showDot && (
        <span
          className="absolute bottom-0 right-0 rounded-full border border-parchment-100"
          style={{
            width: s.dot,
            height: s.dot,
            backgroundColor: INDICATOR_COLORS[indicator],
          }}
        />
      )}
    </div>
  );
}
