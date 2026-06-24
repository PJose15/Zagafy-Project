'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Flame } from 'lucide-react';
import { ParchmentCard } from '@/components/antiquarian';
import type { SessionFlowMoment } from '@/lib/types/writing-session';

interface FlowTimelineProps {
  sessionStart: string; // ISO 8601
  sessionEnd: string;   // ISO 8601
  autoFlowScore: number | null;
  flowMoments: SessionFlowMoment[] | null;
  avgWPM?: number;
}

const TIMELINE_WIDTH = 600;
const TIMELINE_HEIGHT = 40;
const BAR_HEIGHT = 24;
const BAR_Y = 8;

function getSegmentColor(flowScore: number | null, inFlowMoment: boolean): string {
  if (inFlowMoment) return '#166534'; // forest-900
  if (flowScore !== null && flowScore >= 60) return '#b8860b'; // brass
  return '#c9a06b'; // sepia-300
}

export function FlowTimeline({ sessionStart, sessionEnd, autoFlowScore, flowMoments, avgWPM }: FlowTimelineProps) {
  const t = useTranslations('writingStats.timeline');
  const startMs = new Date(sessionStart).getTime();
  const endMs = new Date(sessionEnd).getTime();
  const durationMs = endMs - startMs;

  const segments = useMemo(() => {
    if (durationMs <= 0) return [];
    if (!flowMoments || flowMoments.length === 0) {
      return [{ x: 0, width: TIMELINE_WIDTH, color: getSegmentColor(autoFlowScore, false) }];
    }

    const result: { x: number; width: number; color: string }[] = [];
    let cursor = startMs;

    const sorted = [...flowMoments].sort((a, b) => a.startTime - b.startTime);

    for (const moment of sorted) {
      // Gap before flow moment
      if (moment.startTime > cursor) {
        const gapStart = ((cursor - startMs) / durationMs) * TIMELINE_WIDTH;
        const gapWidth = ((moment.startTime - cursor) / durationMs) * TIMELINE_WIDTH;
        result.push({ x: gapStart, width: gapWidth, color: getSegmentColor(autoFlowScore, false) });
      }

      // Flow moment
      const mStart = ((Math.max(moment.startTime, startMs) - startMs) / durationMs) * TIMELINE_WIDTH;
      const mEnd = ((Math.min(moment.endTime, endMs) - startMs) / durationMs) * TIMELINE_WIDTH;
      result.push({ x: mStart, width: Math.max(2, mEnd - mStart), color: getSegmentColor(autoFlowScore, true) });

      cursor = moment.endTime;
    }

    // Trailing gap
    if (cursor < endMs) {
      const trailStart = ((cursor - startMs) / durationMs) * TIMELINE_WIDTH;
      const trailWidth = ((endMs - cursor) / durationMs) * TIMELINE_WIDTH;
      result.push({ x: trailStart, width: trailWidth, color: getSegmentColor(autoFlowScore, false) });
    }

    return result;
  }, [startMs, endMs, durationMs, autoFlowScore, flowMoments]);

  const flowMomentIcons = useMemo(() => {
    if (!flowMoments || flowMoments.length === 0 || durationMs <= 0) return [];
    return flowMoments.map((m, i) => {
      const midMs = (m.startTime + m.endTime) / 2;
      const x = ((midMs - startMs) / durationMs) * TIMELINE_WIDTH;
      return { x: Math.max(6, Math.min(x, TIMELINE_WIDTH - 6)), key: i };
    });
  }, [flowMoments, startMs, durationMs]);

  if (durationMs <= 0) {
    return null;
  }

  const durationMin = Math.round(durationMs / 60_000);
  const momentCount = flowMoments?.length ?? 0;

  return (
    <ParchmentCard className="p-4" data-testid="flow-timeline">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-sepia-700">{t('title')}</h4>
        <div className="flex items-center gap-3 text-xs text-sepia-600">
          {autoFlowScore !== null && (
            <span>{t.rich('flowScore', { score: autoFlowScore, v: (c) => <strong className="text-sepia-800">{c}</strong> })}</span>
          )}
          {avgWPM !== undefined && avgWPM > 0 && (
            <span>{t('wpm', { wpm: Math.round(avgWPM) })}</span>
          )}
          <span>{t('durationMin', { minutes: durationMin })}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg
          width={TIMELINE_WIDTH}
          height={TIMELINE_HEIGHT}
          role="img"
          aria-label={t('ariaLabel', { count: momentCount, score: autoFlowScore ?? t('scoreNA') })}
          className="block"
        >
          {/* Background */}
          <rect x={0} y={BAR_Y} width={TIMELINE_WIDTH} height={BAR_HEIGHT} rx={4} className="fill-sepia-300/30" />

          {/* Segments */}
          {segments.map((seg, i) => (
            <rect
              key={i}
              x={seg.x}
              y={BAR_Y}
              width={seg.width}
              height={BAR_HEIGHT}
              rx={i === 0 ? 4 : 0}
              fill={seg.color}
              opacity={0.8}
            />
          ))}

          {/* Flow moment fire icons */}
          {flowMomentIcons.map(({ x, key }) => (
            <g key={key} transform={`translate(${x - 6}, 0)`}>
              <Flame size={12} className="text-amber-400" />
            </g>
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-[10px] text-sepia-600">
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded-sm bg-sepia-300 inline-block" /> {t('legendNormal')}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-2 rounded-sm bg-forest-900 inline-block" /> {t('legendFlow')}
        </span>
        {momentCount > 0 && (
          <span className="flex items-center gap-1">
            <Flame size={10} className="text-amber-400" /> {t('moments', { count: momentCount })}
          </span>
        )}
      </div>
    </ParchmentCard>
  );
}
