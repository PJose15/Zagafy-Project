'use client';

const SIZE_MAP = {
  sm: { size: 48, stroke: 4, radius: 18 },
  md: { size: 64, stroke: 5, radius: 25 },
  lg: { size: 96, stroke: 6, radius: 38 },
};

const COLOR_MAP = {
  forest: '#166534',
  brass: '#a88540',
  wax: '#b91c1c',
};

interface ProgressRingProps {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  color?: 'forest' | 'brass' | 'wax';
  children?: React.ReactNode;
}

export function ProgressRing({
  value,
  size = 'md',
  label,
  color = 'forest',
  children,
}: ProgressRingProps) {
  const s = SIZE_MAP[size];
  const circumference = 2 * Math.PI * s.radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <div className="relative" style={{ width: s.size, height: s.size }}>
        <svg
          width={s.size}
          height={s.size}
          viewBox={`0 0 ${s.size} ${s.size}`}
          className="transform -rotate-90"
        >
          {/* Track */}
          <circle
            cx={s.size / 2}
            cy={s.size / 2}
            r={s.radius}
            fill="none"
            stroke="#9a7a4a"
            strokeWidth={s.stroke}
            opacity={0.15}
          />
          {/* Fill arc */}
          <circle
            cx={s.size / 2}
            cy={s.size / 2}
            r={s.radius}
            fill="none"
            stroke={COLOR_MAP[color]}
            strokeWidth={s.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        {/* Center content */}
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      </div>
      {label && (
        <span className="text-[10px] text-sepia-600 font-mono uppercase tracking-wider">{label}</span>
      )}
    </div>
  );
}
