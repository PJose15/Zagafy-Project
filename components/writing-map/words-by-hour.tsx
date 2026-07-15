'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { WritingSession } from '@/lib/types/writing-session';

// Antiquarian palette (recharts sets SVG attributes, so CSS vars don't
// resolve — mirror the globals.css tokens as literals).
const CHART_COLORS = {
  axis: '#7a5a30',        // sepia-600
  bar: '#c9a06b',         // sepia-300 — the quiet hours
  barTop: '#c49b48',      // brass-500 — your golden hours
  tooltipBg: '#f8edd8',   // parchment-100
  tooltipBorder: 'rgba(90, 61, 30, 0.3)',
  tooltipText: '#5a3d1e', // sepia-700
};

interface WordsByHourProps {
  sessions: WritingSession[];
}

interface HourData {
  hour: number;
  label: string;
  hourLabel: string;
  words: number;
  count: number;
  isTop: boolean;
}

function formatHour(h: number): string {
  if (h === 0) return '12a';
  if (h < 12) return `${h}a`;
  if (h === 12) return '12p';
  return `${h - 12}p`;
}

export function WordsByHour({ sessions }: WordsByHourProps) {
  const t = useTranslations('writingStats.byHour');
  const data = useMemo((): HourData[] => {
    const hourBuckets = new Array(24).fill(0) as number[];
    const hourCounts = new Array(24).fill(0) as number[];

    for (const session of sessions) {
      const hour = new Date(session.startedAt).getHours();
      hourBuckets[hour] += session.wordsAdded;
      hourCounts[hour]++;
    }

    // Compute averages
    const hourAverages = hourBuckets.map((total, h) =>
      hourCounts[h] > 0 ? Math.round(total / hourCounts[h]) : 0
    );

    // Find top 3 hours by average
    const sorted = hourAverages
      .map((words, hour) => ({ hour, words }))
      .sort((a, b) => b.words - a.words);
    const topHours = new Set(sorted.slice(0, 3).filter(h => h.words > 0).map(h => h.hour));

    return hourAverages.map((words, hour) => ({
      hour,
      label: formatHour(hour),
      hourLabel: formatHour(hour),
      words,
      count: hourCounts[hour],
      isTop: topHours.has(hour),
    }));
  }, [sessions]);

  const hasData = data.some(d => d.words > 0);

  if (!hasData) {
    return (
      <div className="h-48 flex items-center justify-center text-sepia-600 text-sm" data-testid="words-by-hour-empty">
        {t('empty')}
      </div>
    );
  }

  return (
    <div className="h-48" data-testid="words-by-hour-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: CHART_COLORS.axis }}
            axisLine={false}
            tickLine={false}
            interval={2}
          />
          <YAxis
            tick={{ fontSize: 10, fill: CHART_COLORS.axis }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            cursor={{ fill: 'rgba(196, 155, 72, 0.08)' }}
            contentStyle={{
              backgroundColor: CHART_COLORS.tooltipBg,
              border: `1px solid ${CHART_COLORS.tooltipBorder}`,
              borderRadius: '8px',
              fontSize: '12px',
              color: CHART_COLORS.tooltipText,
              boxShadow: '0 4px 10px rgba(44, 30, 15, 0.12)',
            }}
            formatter={(value, _name, props) => {
              const numValue = Number(value) || 0;
              const count = (props as { payload?: HourData }).payload?.count ?? 0;
              return [t('tooltipSummary', { count, words: numValue }), ''];
            }}
            labelFormatter={(_label, payload) => {
              const hourLabel = (payload as readonly { payload?: HourData }[])?.[0]?.payload?.hourLabel ?? _label;
              return t('tooltipLabel', { hour: String(hourLabel) });
            }}
          />
          <Bar dataKey="words" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.hour}
                fill={entry.isTop ? CHART_COLORS.barTop : CHART_COLORS.bar}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
