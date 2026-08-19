'use client';

import { useEffect } from 'react';
import { EmptyState, ParchmentCard } from '@/components/antiquarian';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Log the error (incl. digest) so production failures leave a diagnostic trail
  // instead of being silently swallowed.
  useEffect(() => {
    console.error('App error boundary:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
      <ParchmentCard variant="translucent">
        <EmptyState variant="generic" title="Something went wrong" subtitle="An unexpected error occurred in the workshop." />
        <div className="flex justify-center mt-4">
          <button
            onClick={reset}
            className="px-4 py-2 bg-parchment-200 hover:bg-parchment-300 text-sepia-900 rounded-lg transition-colors text-sm font-medium"
          >
            Try again
          </button>
        </div>
      </ParchmentCard>
    </div>
  );
}
