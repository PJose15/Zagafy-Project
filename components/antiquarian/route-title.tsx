'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { navItems } from '@/components/antiquarian/parchment-sidebar';

/**
 * P1 — per-route document titles: every browser tab used to read just
 * "Zagafy", making history and tab strips useless. Maps the pathname to its
 * sidebar label ("Manuscript · Zagafy").
 */
export function RouteTitle() {
  const pathname = usePathname();
  const t = useTranslations('nav');

  useEffect(() => {
    let key: string | undefined;
    if (pathname === '/') {
      key = 'dashboard';
    } else if (pathname.startsWith('/settings')) {
      key = 'settings';
    } else {
      key = navItems.find(n => n.href !== '/' && pathname.startsWith(n.href))?.key;
    }
    document.title = key ? `${t(key)} · Zagafy` : 'Zagafy';
  }, [pathname, t]);

  return null;
}
