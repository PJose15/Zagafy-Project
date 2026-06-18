'use client';

import { useState, useMemo, useEffect } from 'react';
import { ParchmentCard } from '@/components/antiquarian';
import { readSessions, type WritingSession } from '@/lib/types/writing-session';
import { readHeteronyms, type Heteronym } from '@/lib/types/heteronym';
import { AvatarCircle } from '@/components/heteronyms/avatar-circle';

export function HeteronymAnalytics() {
  const [sessions, setSessions] = useState<WritingSession[]>([]);
  const [heteronyms] = useState<Heteronym[]>(() => readHeteronyms());
  useEffect(() => { readSessions().then(setSessions); }, []);
  const [selectedId, setSelectedId] = useState<string | 'all'>('all');

  const stats = useMemo(() => {
    const byHeteronym = new Map<string, { words: number; sessions: number; flowScores: number[]; hours: Map<number, number> }>();

    for (const session of sessions) {
      const hId = session.heteronymId || 'unknown';
      const existing = byHeteronym.get(hId) || { words: 0, sessions: 0, flowScores: [] as number[], hours: new Map<number, number>() };
      existing.words += session.wordsAdded;
      existing.sessions++;
      if (session.autoFlowScore !== null && session.autoFlowScore !== undefined) {
        existing.flowScores.push(session.autoFlowScore);
      }
      const hour = new Date(session.startedAt).getHours();
      existing.hours.set(hour, (existing.hours.get(hour) || 0) + session.wordsAdded);
      byHeteronym.set(hId, existing);
    }

    return byHeteronym;
  }, [sessions]);

  const currentStats = selectedId === 'all'
    ? {
        words: sessions.reduce((sum, s) => sum + s.wordsAdded, 0),
        sessions: sessions.length,
        avgFlow: sessions.filter(s => s.autoFlowScore != null).reduce((sum, s) => sum + (s.autoFlowScore || 0), 0) /
                 Math.max(1, sessions.filter(s => s.autoFlowScore != null).length),
        bestHour: null as number | null,
      }
    : (() => {
        const s = stats.get(selectedId);
        if (!s) return { words: 0, sessions: 0, avgFlow: 0, bestHour: null as number | null };
        const avgFlow = s.flowScores.length > 0 ? s.flowScores.reduce((a, b) => a + b, 0) / s.flowScores.length : 0;
        let bestHour: number | null = null;
        let maxWords = 0;
        for (const [hour, words] of s.hours) {
          if (words > maxWords) { maxWords = words; bestHour = hour; }
        }
        return { words: s.words, sessions: s.sessions, avgFlow, bestHour };
      })();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-sepia-700">Per-Voice Analytics</h3>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setSelectedId('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            selectedId === 'all' ? 'bg-brass-500 text-cream-50' : 'text-sepia-600 hover:bg-parchment-200'
          }`}
        >
          All Voices
        </button>
        {heteronyms.map(h => (
          <button
            key={h.id}
            onClick={() => setSelectedId(h.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
              selectedId === h.id ? 'bg-brass-500 text-cream-50' : 'text-sepia-600 hover:bg-parchment-200'
            }`}
          >
            <AvatarCircle color={h.avatarColor} emoji={h.avatarEmoji} size={16} />
            {h.name}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ParchmentCard padding="sm">
          <span className="text-[10px] text-sepia-600 block">Total Words</span>
          <span className="text-lg font-mono text-sepia-800">{currentStats.words.toLocaleString()}</span>
        </ParchmentCard>
        <ParchmentCard padding="sm">
          <span className="text-[10px] text-sepia-600 block">Sessions</span>
          <span className="text-lg font-mono text-sepia-800">{currentStats.sessions}</span>
        </ParchmentCard>
        <ParchmentCard padding="sm">
          <span className="text-[10px] text-sepia-600 block">Avg Flow Score</span>
          <span className="text-lg font-mono text-sepia-800">{Math.round(currentStats.avgFlow)}</span>
        </ParchmentCard>
        <ParchmentCard padding="sm">
          <span className="text-[10px] text-sepia-600 block">Best Hour</span>
          <span className="text-lg font-mono text-sepia-800">
            {currentStats.bestHour !== null ? `${currentStats.bestHour}:00` : '—'}
          </span>
        </ParchmentCard>
      </div>
    </div>
  );
}
