'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Users, UserPlus, BookOpen, LogOut, Trash2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  ParchmentCard,
  ParchmentInput,
  ParchmentSelect,
  BrassButton,
  InkStampButton,
  useConfirm,
} from '@/components/antiquarian';
import { useToast } from '@/components/toast';
import { parseApiResponse } from '@/lib/api-response';
import { getSyncMeta } from '@/lib/sync/sync-queue';
import { useSync } from '@/lib/sync/sync-context';
import { importSharedStory } from '@/lib/collab-client';

/**
 * Collaboration section for the settings page (SaaS mode only).
 *
 * Owner side: invite existing Zagafy users by email as editor/reader on the
 * active project's server story; list + remove collaborators.
 *
 * Collaborator side: "shared with me" list — Open imports the shared story
 * as a new local project bound to the server story, Leave removes access.
 */

interface Collaborator {
  userId: string;
  email: string;
  name: string | null;
  role: string;
}

interface SharedStory {
  storyId: string;
  title: string;
  role: string;
  ownerName: string | null;
  ownerEmail: string;
  updatedAt: string;
}

export function CollaborationSection() {
  const t = useTranslations('collab');
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { syncNow } = useSync();

  const [serverStoryId, setServerStoryId] = useState<string | null>(null);
  const [metaLoaded, setMetaLoaded] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [shared, setShared] = useState<SharedStory[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'reader'>('editor');
  const [inviting, setInviting] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  // SaaS-only: render nothing in embed/keyless mode.
  const authEnabled =
    Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE !== 'embed';

  const loadCollaborators = useCallback(async (storyId: string) => {
    try {
      const res = await fetch(`/api/collaborators?storyId=${encodeURIComponent(storyId)}`);
      const result = await parseApiResponse<{ collaborators: Collaborator[] }>(res);
      if (result.ok) setCollaborators(result.data.collaborators);
    } catch {
      // Non-fatal: list stays empty.
    }
  }, []);

  useEffect(() => {
    if (!authEnabled) return;
    let cancelled = false;

    (async () => {
      try {
        const meta = await getSyncMeta();
        if (cancelled) return;
        const bound = meta?.serverStoryId ?? null;
        setServerStoryId(bound);
        if (bound) void loadCollaborators(bound);
      } finally {
        if (!cancelled) setMetaLoaded(true);
      }
    })();

    (async () => {
      try {
        const res = await fetch('/api/collaborators/shared-with-me');
        const result = await parseApiResponse<{ me: string; stories: SharedStory[] }>(res);
        if (!cancelled && result.ok) {
          setMe(result.data.me);
          setShared(result.data.stories);
        }
      } catch {
        // Non-fatal.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authEnabled, loadCollaborators]);

  const handleInvite = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!serverStoryId) return;
      const trimmed = email.trim();
      if (!trimmed) {
        toast(t('emailRequired'), 'error');
        return;
      }
      setInviting(true);
      try {
        const res = await fetch('/api/collaborators', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId: serverStoryId, email: trimmed, role }),
        });
        const result = await parseApiResponse<{ collaborator: Collaborator }>(res);
        if (!result.ok) {
          toast(result.message, 'error');
          return;
        }
        const added = result.data.collaborator;
        setCollaborators((prev) => [...prev.filter((c) => c.userId !== added.userId), added]);
        setEmail('');
        toast(t('inviteSuccess'), 'success');
      } catch {
        toast(t('genericError'), 'error');
      } finally {
        setInviting(false);
      }
    },
    [email, role, serverStoryId, t, toast],
  );

  const handleRemove = useCallback(
    async (c: Collaborator) => {
      if (!serverStoryId) return;
      const confirmed = await confirm({
        title: t('removeTitle'),
        message: t('removeMessage', { name: c.name || c.email }),
        confirmLabel: t('removeConfirm'),
        variant: 'danger',
      });
      if (!confirmed) return;
      try {
        const res = await fetch('/api/collaborators', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId: serverStoryId, userId: c.userId }),
        });
        const result = await parseApiResponse<{ removed: boolean }>(res);
        if (!result.ok) {
          toast(result.message, 'error');
          return;
        }
        setCollaborators((prev) => prev.filter((x) => x.userId !== c.userId));
        toast(t('removeSuccess'), 'success');
      } catch {
        toast(t('genericError'), 'error');
      }
    },
    [confirm, serverStoryId, t, toast],
  );

  const handleLeave = useCallback(
    async (s: SharedStory) => {
      if (!me) return;
      const confirmed = await confirm({
        title: t('leaveTitle'),
        message: t('leaveMessage', { title: s.title }),
        confirmLabel: t('leaveConfirm'),
        variant: 'danger',
      });
      if (!confirmed) return;
      try {
        const res = await fetch('/api/collaborators', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId: s.storyId, userId: me }),
        });
        const result = await parseApiResponse<{ removed: boolean }>(res);
        if (!result.ok) {
          toast(result.message, 'error');
          return;
        }
        setShared((prev) => prev.filter((x) => x.storyId !== s.storyId));
        toast(t('leaveSuccess'), 'success');
      } catch {
        toast(t('genericError'), 'error');
      }
    },
    [confirm, me, t, toast],
  );

  const handleOpen = useCallback(
    async (s: SharedStory) => {
      setOpening(s.storyId);
      try {
        await importSharedStory(s.storyId, s.title);
        toast(t('openSuccess'), 'success');
        // Pull the shared story now that the (new) active project is bound,
        // then reload so the whole app rehydrates from the new project.
        try {
          await syncNow();
        } catch {
          // The pull will also run when SyncProvider restarts after reload.
        }
        window.location.assign('/');
      } catch {
        toast(t('genericError'), 'error');
        setOpening(null);
      }
    },
    [syncNow, t, toast],
  );

  if (!authEnabled) return null;

  return (
    <ParchmentCard data-testid="collaboration" className="space-y-6">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-brass-600" aria-hidden="true" />
        <h2 className="font-serif text-xl text-sepia-900">{t('title')}</h2>
      </div>
      <p className="text-sm text-sepia-700">{t('description')}</p>

      {/* ── Owner block: invite + collaborator list ── */}
      {metaLoaded && (
        serverStoryId ? (
          <div className="space-y-4">
            <form
              onSubmit={handleInvite}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              data-testid="invite-form"
            >
              <div className="flex-1">
                <ParchmentInput
                  type="email"
                  label={t('emailLabel')}
                  placeholder={t('emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="collaborator-email"
                />
              </div>
              <div className="w-full sm:w-40">
                <ParchmentSelect
                  aria-label={t('roleLabel')}
                  value={role}
                  onChange={(e) => setRole(e.target.value === 'reader' ? 'reader' : 'editor')}
                >
                  <option value="editor">{t('roleEditor')}</option>
                  <option value="reader">{t('roleReader')}</option>
                </ParchmentSelect>
              </div>
              <BrassButton type="submit" disabled={inviting} data-testid="invite-collaborator">
                {inviting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                )}
                {t('invite')}
              </BrassButton>
            </form>

            {collaborators.length === 0 ? (
              <p className="text-sm italic text-sepia-600">{t('noCollaborators')}</p>
            ) : (
              <ul className="divide-y divide-sepia-200" data-testid="collaborator-list">
                {collaborators.map((c) => (
                  <li key={c.userId} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-sepia-900">
                        {c.name || c.email}
                      </p>
                      <p className="truncate text-xs text-sepia-600">{c.email}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded border border-brass-300 bg-parchment-100 px-2 py-0.5 text-xs text-sepia-800">
                        {c.role === 'reader' ? t('roleReader') : t('roleEditor')}
                      </span>
                      <InkStampButton
                        onClick={() => handleRemove(c)}
                        aria-label={t('remove')}
                        data-testid={`remove-collaborator-${c.userId}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </InkStampButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-sm italic text-sepia-600">{t('syncFirst')}</p>
        )
      )}

      {/* ── Shared with me ── */}
      <div className="space-y-3">
        <h3 className="font-serif text-lg text-sepia-900">{t('sharedHeading')}</h3>
        {shared.length === 0 ? (
          <p className="text-sm italic text-sepia-600">{t('noShared')}</p>
        ) : (
          <ul className="divide-y divide-sepia-200" data-testid="shared-with-me-list">
            {shared.map((s) => (
              <li key={s.storyId} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-sepia-900">{s.title}</p>
                  <p className="truncate text-xs text-sepia-600">
                    {t('sharedBy', { name: s.ownerName || s.ownerEmail })} ·{' '}
                    {s.role === 'reader' ? t('roleReader') : t('roleEditor')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <BrassButton
                    onClick={() => handleOpen(s)}
                    disabled={opening === s.storyId}
                    data-testid={`open-shared-${s.storyId}`}
                  >
                    {opening === s.storyId ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <BookOpen className="h-4 w-4" aria-hidden="true" />
                    )}
                    {t('open')}
                  </BrassButton>
                  <InkStampButton onClick={() => handleLeave(s)} aria-label={t('leave')}>
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                  </InkStampButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ParchmentCard>
  );
}
