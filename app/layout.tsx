import type {Metadata} from 'next';
import { Inter, JetBrains_Mono, Playfair_Display } from 'next/font/google';
import './globals.css';
import { isAuthEnabled } from '@/lib/auth';
import { ClerkProvider } from '@clerk/nextjs';
import { PostHogProvider } from '@/components/analytics/posthog-provider';
import { I18nProvider } from '@/lib/i18n/provider';
import { ConsentBanner } from '@/components/analytics/consent-banner';

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

export const metadata: Metadata = {
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
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[200] focus:top-4 focus:left-4 focus:bg-forest-700 focus:text-cream-50 focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-medium">
          Skip to content
        </a>
        {/*
          S1-I04: only the light, global providers live here. The heavy app
          shell (StoryProvider/Dexie, sync, gamification, sidebar, gates) is
          mounted by app/(app)/layout.tsx so marketing/auth pages don't boot it.
          I18nProvider + ConsentBanner are global: marketing pages translate via
          useTranslations and analytics consent applies site-wide.
        */}
        <PostHogProvider>
          <I18nProvider>
            {children}
            <ConsentBanner />
          </I18nProvider>
        </PostHogProvider>
      </body>
    </html>
  );

  return isAuthEnabled() ? <ClerkProvider>{tree}</ClerkProvider> : tree;
}
