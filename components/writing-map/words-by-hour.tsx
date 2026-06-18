'use client';

import { useMemo } from 'react';
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
        No session data yet. Start writing to see your hourly patterns.
      </div>
    );
  }

  return (
    <div className="h-48" data-testid="words-by-hour-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: '#71717a' }}
            axisLine={false}
            tickLine={false}
            interval={2}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#71717a' }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#27272a',
              border: '1px solid #3f3f46',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#e4e4e7',
            }}
            formatter={(value, _name, props) => {
              const numValue = Number(value) || 0;
              const count = (props as { payload?: HourData }).payload?.count ?? 0;
              return [`${count} session${count === 1 ? '' : 's'}, avg ${numValue.toLocaleString()} words`, ''];
            }}
            labelFormatter={(_label, payload) => {
              const hourLabel = (payload as readonly { payload?: HourData }[])?.[0]?.payload?.hourLabel ?? _label;
              return `Sessions starting at ${hourLabel}`;
            }}
          />
          <Bar dataKey="words" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.hour}
                fill={entry.isTop ? '#10b981' : '#3f3f46'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
