'use client';

import { useTranslations } from 'next-intl';

export function StoreSkeleton() {
  const t = useTranslations('common');
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-pulse" aria-label={t('loadingProject')}>
      {/* Header skeleton */}
      <div className="space-y-3">
        <div className="h-8 w-64 bg-parchment-300/40 rounded-lg" />
        <div className="h-4 w-96 bg-parchment-300/30 rounded" />
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-sepia-300/20 bg-parchment-100/60 p-6 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="w-6 h-6 bg-brass-500/15 rounded" />
              <div className="w-10 h-8 bg-parchment-300/40 rounded" />
            </div>
            <div className="h-3 w-20 bg-parchment-300/30 rounded" />
          </div>
        ))}
      </div>

      {/* Content sections skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-5 w-40 bg-parchment-300/30 rounded" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-sepia-300/20 bg-parchment-100/60 p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-brass-500/15" />
                <div className="h-5 w-48 bg-parchment-300/40 rounded" />
              </div>
              <div className="h-3 w-full bg-parchment-300/20 rounded" />
              <div className="h-3 w-3/4 bg-parchment-300/20 rounded" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <div className="h-5 w-32 bg-parchment-300/30 rounded" />
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border border-sepia-300/20 bg-parchment-100/60 p-4 space-y-2">
              <div className="h-3 w-full bg-parchment-300/20 rounded" />
              <div className="h-3 w-2/3 bg-parchment-300/20 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
