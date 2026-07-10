import type {NextConfig} from 'next';
import createBundleAnalyzer from '@next/bundle-analyzer';
import {withSentryConfig} from '@sentry/nextjs';

const withBundleAnalyzer = createBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
});

// Content-Security-Policy is NOT set here. It is generated per-request in
// middleware.ts (`buildCsp` / `applyNonceCsp`) so scripts use a nonce +
// 'strict-dynamic' instead of 'unsafe-inline'. See docs/SECURITY.md §3.1.

// The AI Studio applet runs framed inside ai.studio / aistudio.google.com, so
// in embed mode the app must be frameable by those hosts. `X-Frame-Options: DENY`
// has no cross-origin allowlist, so it's omitted in embed mode and framing is
// governed solely by CSP frame-ancestors (see middleware.ts buildCsp). SaaS
// mode stays locked down.
const isEmbed = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === 'embed';
const frameOptionsHeader = isEmbed
  ? []
  : [{ key: 'X-Frame-Options', value: 'DENY' }];

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', '@react-pdf/renderer', 'docx'],
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        ...frameOptionsHeader,
        { key: 'X-XSS-Protection', value: '0' },
        // Content-Security-Policy: set per-request in middleware.ts (nonce-based).
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      ],
    },
  ],
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  transpilePackages: ['motion'],
  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

const sentryEnabled = Boolean(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN);

const finalConfig = sentryEnabled
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      disableLogger: true,
      automaticVercelMonitors: false,
      tunnelRoute: '/monitoring',
    })
  : nextConfig;

export default withBundleAnalyzer(finalConfig);
