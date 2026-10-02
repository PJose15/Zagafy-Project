'use client';

import { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { openCloudProject } from '@/lib/projects/cloud-projects';
import { ParchmentCard, InkStampButton } from '@/components/antiquarian';

interface CloudStory { storyId: string; title: string; role: 'owner' | 'editor' | 'reader'; canSync: boolean }
interface Catalog { me: string; stories: CloudStory[]; nextCursor: string | null }
export function CloudProjectsSection() {
  return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'embed'
    ? <SignedInCloudProjects /> : null;
}
export function SignedInCloudProjects() {
  const { user, isLoaded, isSignedIn } = useUser();
  const accountId = isSignedIn ? user?.id : undefined;
  // Remount the entire catalog whenever the authenticated account changes.
  return isLoaded && accountId ? <AccountCloudProjects key={accountId} accountId={accountId} /> : null;
}
function AccountCloudProjects({ accountId }: { accountId: string }) {
  const t = useTranslations('projects.cloud');
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [request, setRequest] = useState({ cursor: '', attempt: 0 });
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(false);
    void (async () => {
      try {
        const response = await fetch(`/api/stories${request.cursor ? `?cursor=${encodeURIComponent(request.cursor)}` : ''}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Catalog failed');
        const { data } = await response.json() as { data: Catalog };
        if (data.me !== accountId || !Array.isArray(data.stories)) throw new Error('Account changed');
        if (!controller.signal.aborted) setCatalog(previous => ({ ...data, stories: request.cursor ? Array.from(new Map([...(previous?.stories ?? []), ...data.stories].map(story => [story.storyId, story])).values()) : data.stories }));
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [accountId, request]);
  const open = async (story: CloudStory) => {
    setOpening(story.storyId); setError(false);
    try {
      await openCloudProject(story.storyId, accountId);
      if (alive.current) router.push('/');
    } catch { if (alive.current) setError(true); }
    finally { if (alive.current) setOpening(null); }
  };
  return <ParchmentCard className="space-y-3">
    <h2 className="font-serif text-xl">{t('title')}</h2>
    <p className="text-sm">{t('description')}</p>
    {error && <div role="alert"><p>{t('error')}</p><InkStampButton onClick={() => setRequest(r => ({ ...r, attempt: r.attempt + 1 }))} disabled={loading}>{t('retry')}</InkStampButton></div>}
    {loading && <p role="status">{t('loading')}</p>}
    {!loading && catalog?.stories.length === 0 && <p>{t('empty')}</p>}
    {catalog?.stories.map(story => <div key={story.storyId} className="flex flex-wrap items-center justify-between gap-2 border-t border-sepia-300/30 pt-3">
      <div><p className="font-serif">{story.title}</p><p className="text-xs">{t(`roles.${story.role}`)}</p>{!story.canSync && <p className="text-sm">{t('planRequired')}</p>}</div>
      <InkStampButton disabled={!story.canSync || opening !== null} onClick={() => void open(story)}>{opening === story.storyId ? t('opening') : t('open')}</InkStampButton>
    </div>)}
    {catalog?.nextCursor && <InkStampButton disabled={loading} onClick={() => setRequest(r => ({ cursor: catalog.nextCursor!, attempt: r.attempt + 1 }))}>{t('more')}</InkStampButton>}
  </ParchmentCard>;
}
