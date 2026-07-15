'use client';

/**
 * Ink-drop rating — the antiquarian replacement for emoji scales. Filled
 * drops = score; a full five glows brass (a gilded entry in the ledger).
 * Purely decorative: pair it with a text label or title for accessibility.
 */
export function InkRating({ score, max = 5, size = 'md' }: { score: number; max?: number; size?: 'sm' | 'md' }) {
  const dot = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5';
  const filled = score >= max ? 'bg-brass-500' : 'bg-sepia-700';
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true" data-testid="ink-rating" data-score={score}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={`${dot} rounded-full ${i < score ? filled : 'bg-sepia-300/40'}`}
        />
      ))}
    </span>
  );
}

/** Text form of the ink rating for string-only contexts (tooltips). */
export function inkRatingText(score: number, max = 5): string {
  const s = Math.max(0, Math.min(max, Math.round(score)));
  return '●'.repeat(s) + '○'.repeat(max - s);
}
