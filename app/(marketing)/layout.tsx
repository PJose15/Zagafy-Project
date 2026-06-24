'use client';

import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('marketing');
  const year = new Date().getFullYear();
  return (
    <div className="min-h-screen bg-mahogany-950 text-cream-100 flex flex-col">
      <header className="border-b border-mahogany-700/50 px-6 py-4">
        <nav className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-serif text-xl font-bold text-cream-50">
            <BookOpen size={24} className="text-brass-500" />
            Zagafy
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/features" className="text-cream-200 hover:text-cream-50 transition-colors">{t('nav.features')}</Link>
            <Link href="/pricing" className="text-cream-200 hover:text-cream-50 transition-colors">{t('nav.pricing')}</Link>
            <Link href="/about" className="text-cream-200 hover:text-cream-50 transition-colors">{t('nav.about')}</Link>
            <Link href="/blog" className="text-cream-200 hover:text-cream-50 transition-colors">{t('nav.blog')}</Link>
            <Link href="/docs" className="text-cream-200 hover:text-cream-50 transition-colors">{t('nav.help')}</Link>
            <Link href="/sign-in" className="bg-brass-600 hover:bg-brass-500 text-cream-50 px-4 py-2 rounded-lg font-medium transition-colors">{t('nav.signIn')}</Link>
          </div>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-mahogany-700/50 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-cream-300">
          <p>{t('footer.rights', { year: String(year) })}</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-cream-50 transition-colors">{t('footer.privacy')}</Link>
            <Link href="/terms" className="hover:text-cream-50 transition-colors">{t('footer.terms')}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
