'use client';

import React, { forwardRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { NovelCompletionStats } from '@/lib/gamification/finishing-engine';

interface NovelShareCardProps {
  stats: NovelCompletionStats;
}

const NovelShareCard = forwardRef<HTMLDivElement, NovelShareCardProps>(
  function NovelShareCard({ stats }, ref) {
    const t = useTranslations('novelCompletion.shareCard');
    const tCompletion = useTranslations('novelCompletion');
    const locale = useLocale();
    const statItems = [
      { label: t('words'), value: stats.totalWords.toLocaleString(locale) },
      { label: t('chapters'), value: String(stats.totalChapters) },
      { label: t('sessions'), value: String(stats.totalSessions) },
      { label: t('days'), value: String(stats.totalDays) },
      { label: t('hours'), value: String(stats.totalHoursWriting) },
      { label: t('completed'), value: new Date(stats.completedAt).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) },
    ];

    return (
      <div
        ref={ref}
        style={{
          width: 1080,
          height: 1080,
          background: 'linear-gradient(145deg, #3b1a0a 0%, #5c2d14 50%, #3b1a0a 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 80,
          fontFamily: 'Georgia, serif',
          color: '#f0dfc0',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative border */}
        <div
          style={{
            position: 'absolute',
            inset: 24,
            border: '2px solid rgba(196, 155, 72, 0.3)',
            borderRadius: 8,
            pointerEvents: 'none',
          }}
        />

        {/* Title */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: '#c49b48',
            textAlign: 'center',
            lineHeight: 1.2,
            marginBottom: 48,
            maxWidth: 800,
            wordBreak: 'break-word',
          }}
        >
          {stats.title || tCompletion('defaultTitle')}
        </div>

        {/* Stats grid — 2x3 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 32,
            width: '100%',
            maxWidth: 700,
            marginBottom: 64,
          }}
        >
          {statItems.map((item) => (
            <div key={item.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, fontWeight: 700, color: '#c49b48' }}>
                {item.value}
              </div>
              <div style={{ fontSize: 20, color: 'rgba(240, 223, 192, 0.6)', marginTop: 4 }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 36,
            fontStyle: 'italic',
            color: 'rgba(240, 223, 192, 0.8)',
            marginBottom: 32,
          }}
        >
          {t('tagline')}
        </div>

        {/* Branding */}
        <div
          style={{
            fontSize: 18,
            letterSpacing: 6,
            textTransform: 'uppercase',
            color: 'rgba(196, 155, 72, 0.5)',
          }}
        >
          ZAGAFY
        </div>
      </div>
    );
  },
);

export default NovelShareCard;

export async function generateShareCardPNG(element: HTMLElement): Promise<Blob> {
  const { toPng } = await import('html-to-image');
  const dataUrl = await toPng(element, {
    width: 1080,
    height: 1080,
    pixelRatio: 1,
  });
  const res = await fetch(dataUrl);
  return res.blob();
}
