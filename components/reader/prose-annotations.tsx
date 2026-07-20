'use client';

import { useState } from 'react';
import type { ProseIssue, IssueSeverity } from '@/lib/prose-analysis';

interface ProseAnnotationsProps {
  text: string;
  issues: ProseIssue[];
}

// Off-palette amber swept to house brass.
const severityStyles: Record<IssueSeverity, string> = {
  low: 'decoration-dotted decoration-brass-400',
  medium: 'decoration-dashed decoration-brass-600',
  high: 'decoration-solid decoration-wax-500',
};

export function ProseAnnotations({ text, issues }: ProseAnnotationsProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (issues.length === 0) return <>{text}</>;

  // Filter issues that fall within this text and sort by position
  const relevant = issues
    .filter(i => i.startIndex < text.length && i.endIndex > 0)
    .sort((a, b) => a.startIndex - b.startIndex);

  if (relevant.length === 0) return <>{text}</>;

  // Build annotated segments
  const segments: React.ReactNode[] = [];
  let cursor = 0;

  for (let i = 0; i < relevant.length; i++) {
    const issue = relevant[i];
    const start = Math.max(0, issue.startIndex);
    const end = Math.min(text.length, issue.endIndex);

    if (start > cursor) {
      segments.push(<span key={`t-${cursor}`}>{text.slice(cursor, start)}</span>);
    }

    segments.push(
      // Z15: focusable so keyboard readers can reach the explanation the
      // cursor-help hint promises; the tooltip follows focus as well as hover.
      <span
        key={`i-${i}`}
        tabIndex={0}
        className={`underline ${severityStyles[issue.severity]} cursor-help relative`}
        onMouseEnter={() => setHoveredIndex(i)}
        onMouseLeave={() => setHoveredIndex(null)}
        onFocus={() => setHoveredIndex(i)}
        onBlur={() => setHoveredIndex(null)}
        data-testid="prose-annotation"
      >
        {text.slice(start, end)}
        {hoveredIndex === i && (
          // Z16: wraps instead of nowrap so long suggestions stay on-screen.
          <span className="absolute bottom-full left-0 mb-1 w-max max-w-[16rem] px-2 py-1 bg-parchment-200 text-sepia-800 text-xs rounded shadow-lg z-50 pointer-events-none">
            <strong>{issue.message}</strong>
            <br />
            {issue.suggestion}
          </span>
        )}
      </span>
    );

    cursor = end;
  }

  if (cursor < text.length) {
    segments.push(<span key={`t-${cursor}`}>{text.slice(cursor)}</span>);
  }

  return <>{segments}</>;
}
