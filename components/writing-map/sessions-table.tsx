'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { WritingSession, FlowScore } from '@/lib/types/writing-session';
import { FlowMomentsBadge } from './flow-moments-badge';

const FLOW_EMOJIS: Record<number, string> = {
  1: '😩',
  2: '🙁',
  3: '😐',
  4: '🙂',
  5: '🔥',
};

type SortField = 'date' | 'words' | 'duration' | 'flow' | 'autoFlow';
type SortDir = 'asc' | 'desc';

interface SessionsTableProps {
  sessions: WritingSession[];
}

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

function formatDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

function getDurationMs(s: WritingSession): number {
  return new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime();
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '\u2026' : str;
}

export function SessionsTable({ sessions }: SessionsTableProps) {
  const router = useRouter();
  const t = useTranslations('writingStats.sessions');
  const locale = useLocale();
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const recent = [...sessions].slice(-20);

    recent.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'date':
          cmp = new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
          break;
        case 'words':
          cmp = a.wordsAdded - b.wordsAdded;
          break;
        case 'duration':
          cmp = getDurationMs(a) - getDurationMs(b);
          break;
        case 'flow':
          cmp = (a.flowScore || 0) - (b.flowScore || 0);
          break;
        case 'autoFlow':
          cmp = (a.autoFlowScore || 0) - (b.autoFlowScore || 0);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return recent;
  }, [sessions, sortField, sortDir]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function renderSortIcon(field: SortField) {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? (
      <ChevronUp size={14} className="inline ml-1" />
    ) : (
      <ChevronDown size={14} className="inline ml-1" />
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-sepia-600 text-sm" data-testid="sessions-table-empty">
        {t('empty')}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto" data-testid="sessions-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-sepia-300/50 text-sepia-600">
            <th className="text-left py-2 px-3 font-medium">{t('project')}</th>
            <th className="text-left py-2 px-3 font-medium cursor-pointer hover:text-sepia-800" onClick={() => handleSort('date')}>
              {t('date')} {renderSortIcon("date")}
            </th>
            <th className="text-left py-2 px-3 font-medium">{t('time')}</th>
            <th className="text-right py-2 px-3 font-medium cursor-pointer hover:text-sepia-800" onClick={() => handleSort('words')}>
              {t('words')} {renderSortIcon("words")}
            </th>
            <th className="text-right py-2 px-3 font-medium cursor-pointer hover:text-sepia-800" onClick={() => handleSort('duration')}>
              {t('duration')} {renderSortIcon("duration")}
            </th>
            <th className="text-center py-2 px-3 font-medium cursor-pointer hover:text-sepia-800" onClick={() => handleSort('autoFlow')}>
              {t('autoFlow')} {renderSortIcon("autoFlow")}
            </th>
            <th className="text-center py-2 px-3 font-medium cursor-pointer hover:text-sepia-800" onClick={() => handleSort('flow')}>
              {t('flow')} {renderSortIcon("flow")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((session) => (
            <tr
              key={session.id}
              className="border-b border-sepia-300/30 hover:bg-parchment-200/30 transition-colors cursor-pointer"
              onClick={() => router.push('/flow')}
              data-clickable="true"
            >
              <td className="py-2 px-3 text-sepia-700" title={session.projectName}>
                {truncate(session.projectName, 20)}
              </td>
              <td className="py-2 px-3 text-sepia-800">{formatDate(session.startedAt, locale)}</td>
              <td className="py-2 px-3 text-sepia-600">{formatTime(session.startedAt, locale)}</td>
              <td className="py-2 px-3 text-right text-sepia-800">+{session.wordsAdded.toLocaleString()}</td>
              <td className="py-2 px-3 text-right text-sepia-600">{formatDuration(session.startedAt, session.endedAt)}</td>
              <td className="py-2 px-3 text-center">
                {session.autoFlowScore !== null && session.autoFlowScore !== undefined ? (
                  <div className="flex items-center justify-center gap-1">
                    <span
                      className={`font-medium ${
                        session.autoFlowScore >= 70 ? 'text-forest-700' :
                        session.autoFlowScore >= 40 ? 'text-amber-600' :
                        'text-sepia-600'
                      }`}
                      title={t('autoFlowTitle', { score: session.autoFlowScore })}
                    >
                      {session.autoFlowScore}
                    </span>
                    <FlowMomentsBadge count={session.flowMoments?.length ?? 0} />
                  </div>
                ) : (
                  <span className="text-sepia-600">—</span>
                )}
              </td>
              <td className="py-2 px-3 text-center">
                {session.flowScore ? (
                  <span title={t('flowTitle', { score: session.flowScore })}>{FLOW_EMOJIS[session.flowScore]}</span>
                ) : (
                  <span className="text-sepia-600">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
