import Link from 'next/link';

/**
 * Rendered by the sign-in / sign-up pages when Clerk is not configured
 * (missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) or the app runs in embed mode.
 * Without this, <SignIn/> renders outside a <ClerkProvider> and the page
 * throws a 500 — a misconfigured deployment should degrade, not crash.
 * Server component; English-only by convention for the Clerk-adjacent pages.
 */
export function AuthUnavailable() {
  return (
    <div className="max-w-md rounded-xl border border-sepia-800/40 bg-parchment-100 p-8 text-center shadow-lg">
      <h1 className="font-serif text-xl text-ink-900">Sign-in is not available</h1>
      <p className="mt-3 text-sm text-sepia-700">
        Accounts are not enabled on this deployment. You can keep using Zagafy
        locally — your work is stored in this browser.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-lg bg-forest-700 px-4 py-2 text-sm font-medium text-cream-50 hover:bg-forest-600"
      >
        Back to the workshop
      </Link>
    </div>
  );
}
