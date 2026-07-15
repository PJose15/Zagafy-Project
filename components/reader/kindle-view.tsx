'use client';

import { useState, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { motion, useScroll } from 'motion/react';
import { estimateReadingTime } from '@/lib/reader-utils';
import { ProseAnnotations } from './prose-annotations';
import type { ProseIssue } from '@/lib/prose-analysis';

type KindleTheme = 'light' | 'sepia' | 'dark';

const themes: Record<KindleTheme, { bg: string; text: string }> = {
  light: { bg: 'bg-white', text: 'text-gray-900' },
  sepia: { bg: 'bg-amber-50', text: 'text-amber-900' },
  dark: { bg: 'bg-gray-900', text: 'text-gray-100' },
};

interface KindleViewProps {
  title: string;
  content: string;
  issues: ProseIssue[];
}

export function KindleView({ title, content, issues }: KindleViewProps) {
  const tr = useTranslations('readerView');
  const [theme, setTheme] = useState<KindleTheme>('sepia');
  const [fontSize, setFontSize] = useState(18);
  const [lineSpacing, setLineSpacing] = useState<'normal' | 'relaxed' | 'loose'>('relaxed');
  const readingTime = useMemo(() => estimateReadingTime(content), [content]);
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  // Reading progress — how far through the chapter body you've scrolled.
  const articleRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: articleRef, offset: ['start start', 'end end'] });
  const t = themes[theme];
  const readTimeLabel = readingTime.minutes < 60
    ? tr('readTimeMin', { minutes: readingTime.minutes })
    : tr('readTimeHourMin', { hours: Math.floor(readingTime.minutes / 60), minutes: readingTime.minutes % 60 });

  const lineHeightMap = { normal: '1.5', relaxed: '1.8', loose: '2.2' };

  if (!content.trim()) {
    return <div className="text-center py-16 text-sepia-600">{tr('empty')}</div>;
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
              aria-label={tr('themeAria', { theme: tr(`theme.${k}`) })}
            >
              {tr(`theme.${k}`)}
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
              aria-label={tr('fontSizeAria')}
            />
          </label>
          <select
            value={lineSpacing}
            onChange={e => setLineSpacing(e.target.value as typeof lineSpacing)}
            className="text-xs bg-transparent border border-sepia-300/30 rounded px-1"
            aria-label={tr('lineSpacingAria')}
          >
            <option value="normal">{tr('spacingTight')}</option>
            <option value="relaxed">{tr('spacingNormal')}</option>
            <option value="loose">{tr('spacingLoose')}</option>
          </select>
        </div>
      </div>

      {/* Reading progress line */}
      <div className="sticky top-0 z-10 h-0.5 bg-sepia-300/20" aria-hidden="true">
        <motion.div style={{ scaleX: scrollYProgress }} className="h-full w-full origin-left bg-brass-500" />
      </div>

      {/* Reading area */}
      <div ref={articleRef} className="max-w-[600px] mx-auto px-8 py-12">
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
        {tr('kindleStats', { words: wordCount, readTime: readTimeLabel })}
      </div>
    </div>
  );
}
