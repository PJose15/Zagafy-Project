'use client';

import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { diffWords } from '@/lib/text-diff';
import { getPlainText } from '@/lib/editor/serialization';
import type { ChapterVersion } from '@/lib/types/chapter-version';

interface VersionCompareProps {
  versions: ChapterVersion[];
  onClose: () => void;
}

export function VersionCompare({ versions, onClose }: VersionCompareProps) {
  const [leftId, setLeftId] = useState(versions[0]?.id ?? '');
  const [rightId, setRightId] = useState(versions[1]?.id ?? versions[0]?.id ?? '');

  const leftVersion = versions.find(v => v.id === leftId);
  const rightVersion = versions.find(v => v.id === rightId);

  const diff = useMemo(() => {
    if (!leftVersion || !rightVersion) return [];
    // Versions may hold Lexical JSON (manuscript snapshots) or plain text
    // (flow snapshots) — diff the prose so neither side shows raw JSON.
    return diffWords(getPlainText(leftVersion.content), getPlainText(rightVersion.content));
  }, [leftVersion, rightVersion]);

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4" data-testid="version-compare">
      <div className="bg-parchment-100 rounded-xl shadow-xl w-full max-w-5xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-sepia-300/30">
          <h3 className="text-lg font-medium text-sepia-800">Compare Versions</h3>
          <button onClick={onClose} className="text-sepia-600 hover:text-sepia-700" aria-label="Close comparison">
            <X size={18} />
          </button>
        </div>

        {/* Selectors */}
        <div className="flex gap-4 px-6 py-3 border-b border-sepia-300/20">
          <div className="flex-1">
            <label className="text-xs text-sepia-600 block mb-1">Left</label>
            <select
              value={leftId}
              onChange={e => setLeftId(e.target.value)}
              className="w-full bg-parchment-50 border border-sepia-300 rounded px-2 py-1 text-sm text-sepia-800"
              aria-label="Left version"
            >
              {versions.map(v => (
                <option key={v.id} value={v.id}>{v.label} ({v.wordCount}w)</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-sepia-600 block mb-1">Right</label>
            <select
              value={rightId}
              onChange={e => setRightId(e.target.value)}
              className="w-full bg-parchment-50 border border-sepia-300 rounded px-2 py-1 text-sm text-sepia-800"
              aria-label="Right version"
            >
              {versions.map(v => (
                <option key={v.id} value={v.id}>{v.label} ({v.wordCount}w)</option>
              ))}
            </select>
          </div>
        </div>

        {/* Diff view */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="font-serif text-base leading-relaxed text-sepia-900 whitespace-pre-wrap">
            {diff.map((seg, i) => {
              if (seg.type === 'equal') {
                return <span key={i}>{seg.text}</span>;
              }
              if (seg.type === 'added') {
                return <span key={i} className="bg-forest-400/20 text-forest-900">{seg.text}</span>;
              }
              return <span key={i} className="bg-wax-500/20 text-wax-700 line-through">{seg.text}</span>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
