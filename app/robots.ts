import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // The app itself is auth-gated and per-user; only marketing pages
        // are worth crawling.
        disallow: ['/api/', '/sign-in', '/sign-up'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
