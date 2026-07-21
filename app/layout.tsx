import type {Metadata} from 'next';
import { Inter, JetBrains_Mono, Playfair_Display } from 'next/font/google';
import './globals.css';
import { isAuthEnabled } from '@/lib/auth';
import { ClerkProvider } from '@clerk/nextjs';
import { PostHogProvider } from '@/components/analytics/posthog-provider';
import { I18nProvider } from '@/lib/i18n/provider';
import { ConsentBanner } from '@/components/analytics/consent-banner';
import { SkipLink } from '@/components/skip-link';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-serif',
});

// Nonce-based CSP (middleware.ts) requires dynamic rendering: the per-request
// nonce can't be baked into prerendered HTML, so pages must render at request
// time for Next.js to stamp the nonce onto its inline scripts.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://zagafy.vercel.app',
  ),
  title: 'Zagafy',
  description: 'Your antiquarian narrative workshop.',
  openGraph: {
    title: 'Zagafy',
    description: 'Your antiquarian narrative workshop.',
    type: 'website',
    siteName: 'Zagafy',
    // og:image is provided by app/opengraph-image.tsx (Next.js file convention)
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Zagafy',
    description: 'Your antiquarian narrative workshop.',
    // twitter:image is provided by app/twitter-image.tsx (Next.js file convention)
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  const tree = (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${playfair.variable}`}>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="bg-mahogany-950 text-cream-100 font-sans antialiased min-h-screen flex flex-col md:flex-row" suppressHydrationWarning>
        {/*
          S1-I04: only the light, global providers live here. The heavy app
          shell (StoryProvider/Dexie, sync, gamification, sidebar, gates) is
          mounted by app/(app)/layout.tsx so marketing/auth pages don't boot it.
          I18nProvider + ConsentBanner are global: marketing pages translate via
          useTranslations and analytics consent applies site-wide. The skip
          link lives inside I18nProvider so it renders in the user's locale.
        */}
        <PostHogProvider>
          <I18nProvider>
            <SkipLink />
            {children}
            <ConsentBanner />
          </I18nProvider>
        </PostHogProvider>
      </body>
    </html>
  );

  return isAuthEnabled() ? <ClerkProvider>{tree}</ClerkProvider> : tree;
}
