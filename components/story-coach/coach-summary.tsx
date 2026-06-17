'use client';

import { ParchmentCard } from '@/components/antiquarian';
import { Lightbulb } from 'lucide-react';
import Link from 'next/link';
import type { CoachingInsight } from '@/lib/story-coach/types';

interface CoachSummaryProps {
  insights: CoachingInsight[];
  chapterTitle?: string;
}

export function CoachSummary({ insights, chapterTitle }: CoachSummaryProps) {
  const highCount = insights.filter(i => i.priority === 'high').length;
  const total = insights.length;

  if (total === 0) return null;

  // M15: /flow reads the current chapter from session state, so no chapterId param needed
  return (
    <Link href="/flow">
      <ParchmentCard padding="sm" hover className="cursor-pointer">
        <div className="flex items-center gap-2">
          <Lightbulb size={16} className="text-brass-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-sepia-800 font-medium">
              {highCount > 0 ? `${highCount} high-priority insight${highCount !== 1 ? 's' : ''}` : `${total} coaching insight${total !== 1 ? 's' : ''}`}
              {chapterTitle ? ` for "${chapterTitle}"` : ''}
            </p>
            <p className="text-[10px] text-sepia-600 mt-0.5">Open Flow Mode to review</p>
          </div>
        </div>
      </ParchmentCard>
    </Link>
  );
}
