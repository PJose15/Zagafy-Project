import { AppShell } from '@/components/app-shell';

/**
 * Layout for the writing application (S1-I04). Everything inside this route
 * group gets the full LibraryShell — StoryProvider (Dexie hydration +
 * migration), SyncProvider, GamificationProvider, sidebar, DiagnosticGate,
 * onboarding tour, etc. The (marketing) and (auth) groups intentionally do NOT
 * mount this shell, so public pages don't pay for IndexedDB open, the provider
 * tree, or render the app sidebar; they get only the root layout's light
 * I18nProvider + ConsentBanner.
 */
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
