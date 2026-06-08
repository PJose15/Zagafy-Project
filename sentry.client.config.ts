import * as Sentry from '@sentry/nextjs';
import { scrubEvent, scrubBreadcrumb } from '@/lib/sentry-pii';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}
