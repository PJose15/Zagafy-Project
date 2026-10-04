'use client';
import { useUser } from '@clerk/nextjs';
import { useEffect, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { SyncProvider } from './sync-context';
import { workspaceAllowsSync, getWorkspaceOwner, subscribeWorkspaceOwner } from './workspace-owner';

function SignedInSync({ children }: { children: React.ReactNode }) {
  const { isLoaded, user } = useUser();
  const userId = user?.id;
  const t = useTranslations('sync');
  const owner = useSyncExternalStore(subscribeWorkspaceOwner, getWorkspaceOwner, () => null);
  useEffect(() => {
    if (isLoaded && userId) workspaceAllowsSync(userId);
  }, [isLoaded, userId]);
  return <SyncProvider key={userId ?? 'signed-out'} enabled={Boolean(isLoaded && userId && owner === userId)}>
    {isLoaded && userId && owner && owner !== userId && <div role="status" className="px-4 py-3 bg-parchment-200 text-sepia-900">{t('workspaceAccountNotice')}</div>}
    {children}
  </SyncProvider>;
}

/** Mount Clerk hooks only when the root layout has a ClerkProvider. */
export function AuthenticatedSyncProvider({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  return enabled ? <SignedInSync>{children}</SignedInSync> : <SyncProvider enabled={false}>{children}</SyncProvider>;
}
