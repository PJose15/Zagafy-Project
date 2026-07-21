/**
 * Canonical public site URL, used by robots/sitemap/metadataBase.
 * Falls back to the Vercel production hostname so metadata resolves even
 * before APP_URL is configured; set APP_URL/NEXT_PUBLIC_APP_URL when moving
 * to a custom domain.
 */
export const SITE_URL =
  process.env.APP_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://zagafy.vercel.app';
