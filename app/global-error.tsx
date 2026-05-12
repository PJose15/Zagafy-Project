'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Something went wrong</h1>
          <p style={{ color: '#666', marginBottom: '1.5rem' }}>The workshop encountered an unexpected error.</p>
          <button
            onClick={reset}
            style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #ccc', cursor: 'pointer', background: '#f5f5f5' }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
