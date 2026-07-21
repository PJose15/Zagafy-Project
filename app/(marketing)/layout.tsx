'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BookOpen, Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('marketing');
  const year = new Date().getFullYear();
  const [menuOpen, setMenuOpen] = useState(false);

  // Escape closes the mobile menu.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const links = [
    { href: '/features', label: t('nav.features') },
    { href: '/pricing', label: t('nav.pricing') },
    { href: '/about', label: t('nav.about') },
    { href: '/blog', label: t('nav.blog') },
    { href: '/docs', label: t('nav.help') },
  ];

  return (
    <div className="min-h-screen bg-mahogany-950 text-cream-100 flex flex-col">
      <header className="border-b border-mahogany-700/50 px-6 py-4">
        <nav className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-serif text-xl font-bold text-cream-50">
            <BookOpen size={24} className="text-brass-500" />
            Zagafy
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-cream-200 hover:text-cream-50 transition-colors">{l.label}</Link>
            ))}
            <Link href="/sign-in" className="bg-brass-600 hover:bg-brass-500 text-cream-50 px-4 py-2 rounded-lg font-medium transition-colors">{t('nav.signIn')}</Link>
          </div>
          {/* Mobile: the nav above is hidden under md — a hamburger keeps
              every link (and Sign In) reachable on small screens. */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="marketing-mobile-nav"
            aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
            className="md:hidden p-2 -mr-2 rounded-lg text-cream-200 hover:text-cream-50 hover:bg-mahogany-800/60 transition-colors"
          >
            {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </nav>
        {menuOpen && (
          <div id="marketing-mobile-nav" className="md:hidden max-w-6xl mx-auto mt-4 flex flex-col gap-1 text-sm border-t border-mahogany-700/50 pt-3">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="px-2 py-2 rounded-lg text-cream-200 hover:text-cream-50 hover:bg-mahogany-800/60 transition-colors"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/sign-in"
              onClick={() => setMenuOpen(false)}
              className="mt-2 bg-brass-600 hover:bg-brass-500 text-cream-50 px-4 py-2 rounded-lg font-medium text-center transition-colors"
            >
              {t('nav.signIn')}
            </Link>
          </div>
        )}
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
