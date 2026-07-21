import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

const MARKETING_PATHS = [
  '',
  '/about',
  '/blog',
  '/docs',
  '/features',
  '/pricing',
  '/privacy',
  '/terms',
];

export default function sitemap(): MetadataRoute.Sitemap {
  return MARKETING_PATHS.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: path === '/blog' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : path === '/pricing' ? 0.9 : 0.6,
  }));
}
