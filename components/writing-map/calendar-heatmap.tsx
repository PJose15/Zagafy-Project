'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { WritingSession } from '@/lib/types/writing-session';
import { formatDateKey } from '@/lib/gamification/date-utils';

const CELL_SIZE = 14;
const CELL_GAP = 2;
const TOTAL_CELL = CELL_SIZE + CELL_GAP;
const WEEKS = 52;
const DAYS = 7;
const MONTH_LABEL_HEIGHT = 16;
const DAY_LABEL_WIDTH = 28;

const COLORS = [
  'fill-sepia-300/50',       // 0 words
  'fill-forest-900',    // low
  'fill-forest-700',    // medium
  'fill-forest-500',    // high
  'fill-forest-400',    // very high
];

function getColorClass(words: number): string {
  if (words === 0) return COLORS[0];
  if (words <= 200) return COLORS[1];
  if (words <= 500) return COLORS[2];
  if (words <= 1000) return COLORS[3];
  return COLORS[4];
}

const FLOW_EMOJIS: Record<number, string> = {
  1: '😩',
  2: '🙁',
  3: '😐',
  4: '🙂',
  5: '🔥',
};

interface DayData {
  words: number;
  sessionCount: number;
  avgFlowScore: number | null;
  totalMinutes: number;
  flowMomentCount: number;
  avgAutoFlowScore: number | null;
}

interface CalendarHeatmapProps {
  sessions: WritingSession[];
}

export function CalendarHeatmap({ sessions }: CalendarHeatmapProps) {
  const t = useTranslations('writingStats.heatmap');
  const locale = useLocale();
  const [tooltip, setTooltip] = useState<{ x: number; y: number; lines: string[] } | null>(null);

  // Localized short month names (index 0–11) and day-row labels (only Mon/Wed/
  // Fri shown). Jan 7 2001 was a Sunday, so getDay()===i for new Date(2001,0,7+i).
  const monthNames = useMemo(
    () => Array.from({ length: 12 }, (_, m) =>
      new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(2000, m, 1))),
    [locale],
  );
  const dayLabels = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    return [0, 1, 2, 3, 4, 5, 6].map(i =>
      i === 1 || i === 3 || i === 5 ? fmt.format(new Date(2001, 0, 7 + i)) : '');
  }, [locale]);

  const { cells, monthLabels } = useMemo(() => {
    // Build a map of date -> aggregated data
    const dayMap = new Map<string, { words: number; sessionCount: number; flowScores: number[]; totalMs: number; flowMomentCount: number; autoFlowScores: number[] }>();
    for (const session of sessions) {
      // REG-10: bucket by the session's LOCAL date so the heatmap agrees with the
      // writing streak (which keys days via formatDateKey/local time). Using the
      // ISO string's UTC date here caused west-of-UTC late-evening sessions to
      // land on a different day than the streak counted them.
      const date = formatDateKey(new Date(session.startedAt));
      const existing = dayMap.get(date) || { words: 0, sessionCount: 0, flowScores: [], totalMs: 0, flowMomentCount: 0, autoFlowScores: [] };
      existing.words += session.wordsAdded;
      existing.sessionCount++;
      if (session.flowScore) existing.flowScores.push(session.flowScore);
      existing.totalMs += new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime();
      existing.flowMomentCount += session.flowMoments?.length ?? 0;
      if (session.autoFlowScore !== null && session.autoFlowScore !== undefined) {
        existing.autoFlowScores.push(session.autoFlowScore);
      }
      dayMap.set(date, existing);
    }

    // Generate 365 days ending today
    const today = new Date();
    const cells: { date: string; words: number; col: number; row: number; dayData: DayData }[] = [];
    const monthPositions = new Map<number, number>();

    // Find the start date (364 days ago)
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 364);

    // Adjust to start on Sunday
    const startDay = startDate.getDay();
    if (startDay !== 0) {
      startDate.setDate(startDate.getDate() - startDay);
    }

    const cursor = new Date(startDate);
    let col = 0;

    while (cursor <= today) {
      const row = cursor.getDay();
      if (row === 0 && cursor > startDate) col++;

      // REG-10: key grid cells by LOCAL date to match both the cursor's local
      // getDay()/getMonth() (rows/month labels) and the local session buckets above.
      const dateStr = formatDateKey(cursor);
      const raw = dayMap.get(dateStr);
      const words = raw?.words || 0;
      const dayData: DayData = {
        words,
        sessionCount: raw?.sessionCount || 0,
        avgFlowScore: raw && raw.flowScores.length > 0
          ? Math.round(raw.flowScores.reduce((a, b) => a + b, 0) / raw.flowScores.length)
          : null,
        totalMinutes: raw ? Math.round(raw.totalMs / 60_000) : 0,
        flowMomentCount: raw?.flowMomentCount || 0,
        avgAutoFlowScore: raw && raw.autoFlowScores.length > 0
          ? Math.round(raw.autoFlowScores.reduce((a, b) => a + b, 0) / raw.autoFlowScores.length)
          : null,
      };

      cells.push({ date: dateStr, words, col, row, dayData });

      // Track month positions (first occurrence of each month in a week)
      const month = cursor.getMonth();
      if (row === 0 && !monthPositions.has(month * 100 + cursor.getFullYear())) {
        monthPositions.set(month * 100 + cursor.getFullYear(), col);
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    const monthLabels = Array.from(monthPositions.entries()).map(([key, col]) => ({
      monthIndex: key % 100,
      col,
    }));

    return { cells, monthLabels };
  }, [sessions]);

  const svgWidth = DAY_LABEL_WIDTH + (WEEKS + 1) * TOTAL_CELL;
  const svgHeight = MONTH_LABEL_HEIGHT + DAYS * TOTAL_CELL;

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <svg
          width={svgWidth}
          height={svgHeight}
          role="img"
          aria-label={t('ariaLabel')}
          className="block"
        >
          {/* Day labels */}
          {dayLabels.map((label, i) =>
            label ? (
              <text
                key={i}
                x={DAY_LABEL_WIDTH - 4}
                y={MONTH_LABEL_HEIGHT + i * TOTAL_CELL + CELL_SIZE - 2}
                className="fill-sepia-500 text-[10px]"
                textAnchor="end"
              >
                {label}
              </text>
            ) : null
          )}

          {/* Month labels */}
          {monthLabels.map((m, i) => (
            <text
              key={i}
              x={DAY_LABEL_WIDTH + m.col * TOTAL_CELL}
              y={MONTH_LABEL_HEIGHT - 4}
              className="fill-sepia-500 text-[10px]"
            >
              {monthNames[m.monthIndex]}
            </text>
          ))}

          {/* Cells */}
          {cells.map((cell) => {
            const fullDate = new Date(cell.date + 'T12:00:00').toLocaleDateString(locale, {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            });
            const { dayData } = cell;
            const flowEmoji = dayData.avgFlowScore ? FLOW_EMOJIS[dayData.avgFlowScore] : null;
            const durationStr = dayData.totalMinutes < 60
              ? `${dayData.totalMinutes}m`
              : `${Math.floor(dayData.totalMinutes / 60)}h ${dayData.totalMinutes % 60}m`;

            return (
              <rect
                key={cell.date}
                x={DAY_LABEL_WIDTH + cell.col * TOTAL_CELL}
                y={MONTH_LABEL_HEIGHT + cell.row * TOTAL_CELL}
                width={CELL_SIZE}
                height={CELL_SIZE}
                rx={3}
                className={`${getColorClass(cell.words)} transition-colors cursor-pointer`}
                role="gridcell"
                aria-label={t('cellAria', { date: cell.date, words: cell.words })}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const lines = [fullDate];
                  if (dayData.sessionCount > 0) {
                    lines.push(t('words', { count: cell.words }));
                    lines.push(t('sessions', { count: dayData.sessionCount }));
                    lines.push(flowEmoji ? t('avgFlow', { emoji: flowEmoji }) : t('noRating'));
                    if (dayData.avgAutoFlowScore !== null) {
                      lines.push(t('autoFlow', { score: dayData.avgAutoFlowScore }));
                    }
                    if (dayData.flowMomentCount > 0) {
                      lines.push(t('flowMoments', { count: dayData.flowMomentCount }));
                    }
                    lines.push(t('writingTime', { duration: durationStr }));
                  } else {
                    lines.push(t('noWriting'));
                  }
                  setTooltip({
                    x: rect.left + rect.width / 2,
                    y: rect.top - 8,
                    lines,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })}
        </svg>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 px-3 py-2 text-xs bg-parchment-200 text-sepia-800 rounded shadow-lg pointer-events-none -translate-x-1/2 -translate-y-full"
          style={{ left: tooltip.x, top: tooltip.y }}
          data-testid="heatmap-tooltip"
        >
          {tooltip.lines.map((line, i) => (
            <div key={i} className={i === 0 ? 'font-medium' : 'text-sepia-600'}>{line}</div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-1 mt-2 text-[10px] text-sepia-600 justify-end">
        <span>{t('less')}</span>
        {COLORS.map((color, i) => (
          <svg key={i} width={CELL_SIZE} height={CELL_SIZE}>
            <rect width={CELL_SIZE} height={CELL_SIZE} rx={3} className={color} />
          </svg>
        ))}
        <span>{t('more')}</span>
      </div>
    </div>
  );
}
