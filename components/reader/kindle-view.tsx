'use client';

import { useState, useMemo } from 'react';
import { estimateReadingTime } from '@/lib/reader-utils';
import { ProseAnnotations } from './prose-annotations';
import type { ProseIssue } from '@/lib/prose-analysis';

type KindleTheme = 'light' | 'sepia' | 'dark';

const themes: Record<KindleTheme, { bg: string; text: string; label: string }> = {
  light: { bg: 'bg-white', text: 'text-gray-900', label: 'Light' },
  sepia: { bg: 'bg-amber-50', text: 'text-amber-900', label: 'Sepia' },
  dark: { bg: 'bg-gray-900', text: 'text-gray-100', label: 'Dark' },
};

interface KindleViewProps {
  title: string;
  content: string;
  issues: ProseIssue[];
}

export function KindleView({ title, content, issues }: KindleViewProps) {
  const [theme, setTheme] = useState<KindleTheme>('sepia');
  const [fontSize, setFontSize] = useState(18);
  const [lineSpacing, setLineSpacing] = useState<'normal' | 'relaxed' | 'loose'>('relaxed');
  const readingTime = useMemo(() => estimateReadingTime(content), [content]);
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  const t = themes[theme];

  const lineHeightMap = { normal: '1.5', relaxed: '1.8', loose: '2.2' };

  if (!content.trim()) {
    return <div className="text-center py-16 text-sepia-600">This chapter is empty.</div>;
  }

  return (
    <div className={`min-h-[60vh] ${t.bg} transition-colors`} data-testid="kindle-view">
      {/* Controls bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-sepia-300/20">
        <div className="flex items-center gap-2">
          {(Object.keys(themes) as KindleTheme[]).map(k => (
            <button
              key={k}
              onClick={() => setTheme(k)}
              className={`text-xs px-2 py-1 rounded ${theme === k ? 'bg-sepia-300/50 font-medium' : 'hover:bg-sepia-200/30'} ${t.text}`}
              aria-label={`${themes[k].label} theme`}
            >
              {themes[k].label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-sepia-600">
            <span>Aa</span>
            <input
              type="range"
              min={14}
              max={28}
              value={fontSize}
              onChange={e => setFontSize(Number(e.target.value))}
              className="w-20"
              aria-label="Font size"
            />
          </label>
          <select
            value={lineSpacing}
            onChange={e => setLineSpacing(e.target.value as typeof lineSpacing)}
            className="text-xs bg-transparent border border-sepia-300/30 rounded px-1"
            aria-label="Line spacing"
          >
            <option value="normal">Tight</option>
            <option value="relaxed">Normal</option>
            <option value="loose">Loose</option>
          </select>
        </div>
      </div>

      {/* Reading area */}
      <div className="max-w-[600px] mx-auto px-8 py-12">
        <h2 className={`text-2xl font-serif ${t.text} mb-8 text-center`}>{title}</h2>
        <div
          className={`font-serif ${t.text} whitespace-pre-wrap`}
          style={{ fontSize: `${fontSize}px`, lineHeight: lineHeightMap[lineSpacing] }}
        >
          {issues.length > 0 ? (
            <ProseAnnotations text={content} issues={issues} />
          ) : (
            content
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="sticky bottom-0 px-4 py-2 text-xs text-sepia-600 text-center border-t border-sepia-300/20">
        {wordCount.toLocaleString()} words &middot; {readingTime.display}
      </div>
    </div>
  );
}
