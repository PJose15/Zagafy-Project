'use client';

import { useStory, StoryState } from '@/lib/store';
import { useRef, useEffect, useState } from 'react';
import { Settings, Download, Upload, Trash2, AlertTriangle, Globe, Languages, SpellCheck, BarChart3, Compass } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useProfile } from '@/hooks/use-profile';
import { LOCALES, LOCALE_LABELS, normalizeLocale } from '@/lib/i18n/config';
import { BillingSection } from '@/components/billing/billing-section';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm-dialog';
import { HeteronymSettings } from '@/components/heteronyms/heteronym-settings';
import { ProfileSettings } from '@/components/profile/profile-settings';
import { BrassButton, InkStampButton, CarvedHeader, ParchmentCard } from '@/components/antiquarian';
import { db, clearAllStoryData } from '@/lib/storage/dexie-db';
import { useSpellcheckPreference } from '@/hooks/use-spellcheck-preference';
import { useAnalyticsConsent } from '@/hooks/use-analytics-consent';
import { clearAllInsights, readWriterInsights } from '@/lib/writer-memory';

// Only these keys from StoryState are allowed during import
const ALLOWED_KEYS = new Set<keyof StoryState>([
  'language', 'title', 'genre', 'synopsis', 'author_intent',
  'chapters', 'scenes', 'characters', 'timeline_events',
  'open_loops', 'world_rules', 'style_profile', 'active_conflicts',
  'foreshadowing_elements', 'locations', 'themes', 'canon_items',
  'ambiguities', 'chat_messages',
]);

// DOS guards for imported payload
const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024; // 20 MB raw file
const MAX_TITLE = 500;
const MAX_STRING_FIELD = 10_000;
const MAX_CHAPTER_COUNT = 1_000;
// CB-07: chapter content is now Lexical JSON (~2-3x larger than the plain
// text it encodes), so this byte cap is raised to keep the effective
// writing-length headroom it had when content was plain text.
const MAX_CHAPTER_CONTENT = 1_500_000;
const MAX_ARRAY_ITEMS = 10_000;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateImportShape(data: unknown): { ok: true } | { ok: false; reason: string } {
  if (!isPlainObject(data)) return { ok: false, reason: 'root must be an object' };
  if (typeof data.title !== 'string') return { ok: false, reason: 'title must be a string' };
  if (data.title.length > MAX_TITLE) return { ok: false, reason: `title exceeds ${MAX_TITLE} characters` };
  if (!Array.isArray(data.characters)) return { ok: false, reason: 'characters must be an array' };
  if (!Array.isArray(data.chapters)) return { ok: false, reason: 'chapters must be an array' };
  if (data.chapters.length > MAX_CHAPTER_COUNT) return { ok: false, reason: `too many chapters (max ${MAX_CHAPTER_COUNT})` };
  if (data.characters.length > MAX_ARRAY_ITEMS) return { ok: false, reason: `too many characters (max ${MAX_ARRAY_ITEMS})` };
  for (const ch of data.chapters) {
    if (!isPlainObject(ch)) return { ok: false, reason: 'each chapter must be an object' };
    if (typeof ch.content === 'string' && ch.content.length > MAX_CHAPTER_CONTENT) {
      return { ok: false, reason: `a chapter exceeds ${MAX_CHAPTER_CONTENT} characters` };
    }
    if (typeof ch.title === 'string' && ch.title.length > MAX_STRING_FIELD) {
      return { ok: false, reason: `a chapter title exceeds ${MAX_STRING_FIELD} characters` };
    }
  }
  // Cap common scalar string fields
  for (const k of ['genre', 'synopsis', 'author_intent', 'language'] as const) {
    const v = data[k];
    if (v !== undefined && (typeof v !== 'string' || v.length > MAX_STRING_FIELD)) {
      return { ok: false, reason: `${k} must be a string under ${MAX_STRING_FIELD} chars` };
    }
  }
  // Cap remaining arrays to prevent balloon state
  for (const k of [
    'scenes', 'timeline_events', 'open_loops', 'world_rules',
    'active_conflicts', 'foreshadowing_elements', 'locations', 'themes',
    'canon_items', 'ambiguities', 'chat_messages',
  ] as const) {
    const v = data[k];
    if (v !== undefined && (!Array.isArray(v) || v.length > MAX_ARRAY_ITEMS)) {
      return { ok: false, reason: `${k} must be an array with at most ${MAX_ARRAY_ITEMS} items` };
    }
  }
  return { ok: true };
}

export default function SettingsPage() {
  const router = useRouter();
  const { state, setState, updateField } = useStory();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<FileReader | null>(null);
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const spellcheck = useSpellcheckPreference();
  const { consent, dnt, setConsent } = useAnalyticsConsent();
  const [insightCount, setInsightCount] = useState(0);
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const { profile, setPreferences } = useProfile();
  const uiLocale = normalizeLocale(profile?.preferences.uiLocale);

  useEffect(() => {
    let cancelled = false;
    readWriterInsights().then(list => {
      if (!cancelled) setInsightCount(list.length);
    });
    return () => { cancelled = true; };
  }, []);

  const handleClearMemory = async () => {
    const ok = await confirm({
      title: t('writerMemory.confirmTitle'),
      message: t('writerMemory.confirmMessage', { count: insightCount }),
      confirmLabel: t('writerMemory.confirmLabel'),
      variant: 'danger',
    });
    if (!ok) return;
    await clearAllInsights();
    setInsightCount(0);
    toast(t('writerMemory.cleared'), 'success');
  };

  // Abort any in-flight FileReader on unmount
  useEffect(() => {
    return () => { readerRef.current?.abort(); };
  }, []);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      toast(t('restoreProject.tooLarge', { mb: Math.round(MAX_IMPORT_FILE_BYTES / (1024 * 1024)) }), 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    readerRef.current?.abort();
    const reader = new FileReader();
    readerRef.current = reader;
    reader.onload = async (event) => {
      try {
        const data: unknown = JSON.parse(event.target?.result as string);
        const check = validateImportShape(data);
        if (!check.ok) {
          toast(t('restoreProject.invalidFile', { reason: check.reason }), 'error');
          return;
        }
        const validated = data as Record<string, unknown>;
        const confirmed = await confirm({
          title: t('restoreProject.confirmTitle'),
          message: t('restoreProject.confirmMessage'),
          confirmLabel: t('restoreProject.confirmLabel'),
          variant: 'danger',
        });
        if (!confirmed) return;

        // Auto-backup current state before overwriting (Dexie stories_backup row)
        try {
          await db.stories.put({
            id: 'backup',
            data: JSON.stringify(state),
            updatedAt: Date.now(),
          });
        } catch {
          // Backup failed — proceed anyway
        }

        // Whitelist keys to prevent arbitrary state injection
        const sanitized: Record<string, unknown> = {};
        for (const key of Object.keys(validated)) {
          if (ALLOWED_KEYS.has(key as keyof StoryState)) {
            sanitized[key] = validated[key];
          }
        }
        setState((prev) => ({ ...prev, ...sanitized }));
        toast(t('restoreProject.success'), 'success');
      } catch {
        toast(t('restoreProject.parseError'), 'error');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    const safeName = state.title.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'story_bible';
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.href = url;
    downloadAnchorNode.download = `${safeName}_story_bible.json`;
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    URL.revokeObjectURL(url);
    toast(t('exportProject.success'), 'success');
  };

  const handleClear = async () => {
    const confirmed = await confirm({
      title: t('danger.confirmTitle'),
      message: t('danger.confirmMessage'),
      confirmLabel: t('danger.confirmLabel'),
      variant: 'danger',
    });
    if (confirmed) {
      try {
        await clearAllStoryData();
      } catch {
        // If Dexie clear fails, fall through to reload anyway
      }
      // Also remove any straggler localStorage keys from older builds
      try {
        localStorage.removeItem('zagafy_state');
        localStorage.removeItem('zagafy_chapter_versions');
        localStorage.removeItem('zagafy_sessions');
      } catch {
        // best effort
      }
      window.location.reload();
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-10">
      <CarvedHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<Settings size={24} />}
      />

      <div className="space-y-8">
        <ProfileSettings />

        <BillingSection />

        <ParchmentCard className="space-y-4">
          <h2 className="text-xl font-serif font-semibold text-sepia-900 flex items-center gap-2">
            <Languages size={20} className="text-brass-500" />
            {t('appLanguage.heading')}
          </h2>
          <p className="text-sepia-600 text-sm leading-relaxed">
            {t('appLanguage.description')}
          </p>
          <select
            value={uiLocale}
            onChange={(e) => setPreferences({ uiLocale: normalizeLocale(e.target.value) })}
            className="bg-parchment-200 border border-sepia-300/60 text-sepia-900 px-4 py-2 rounded-lg font-medium focus:border-brass-500/60 focus:ring-2 focus:ring-brass-400/40 outline-none"
            aria-label={t('appLanguage.ariaLabel')}
          >
            {LOCALES.map((loc) => (
              <option key={loc} value={loc}>{LOCALE_LABELS[loc]}</option>
            ))}
          </select>
        </ParchmentCard>

        <ParchmentCard className="space-y-4">
          <h2 className="text-xl font-serif font-semibold text-sepia-900 flex items-center gap-2">
            <Globe size={20} className="text-brass-500" />
            {t('projectLanguage.heading')}
          </h2>
          <p className="text-sepia-600 text-sm leading-relaxed">
            {t('projectLanguage.description')}
          </p>
          <select
            value={state.language || 'English'}
            onChange={(e) => updateField('language', e.target.value)}
            className="bg-parchment-200 border border-sepia-300/60 text-sepia-900 px-4 py-2 rounded-lg font-medium focus:border-brass-500/60 focus:ring-2 focus:ring-brass-400/40 outline-none"
            aria-label={t('projectLanguage.ariaLabel')}
          >
            <option value="English">English</option>
            <option value="Spanish">Español (Spanish)</option>
            <option value="French">Français (French)</option>
            <option value="Portuguese">Português (Portuguese)</option>
            <option value="German">Deutsch (German)</option>
            <option value="Italian">Italiano (Italian)</option>
            <option value="Japanese">日本語 (Japanese)</option>
            <option value="Korean">한국어 (Korean)</option>
            <option value="Chinese">中文 (Chinese)</option>
            <option value="Russian">Русский (Russian)</option>
            <option value="Arabic">العربية (Arabic)</option>
          </select>
        </ParchmentCard>

        <HeteronymSettings />

        {/* MP-11 / Phase 4.12 — writer memory controls */}
        <ParchmentCard className="space-y-4">
          <h2 className="text-xl font-serif font-semibold text-sepia-900 flex items-center gap-2">
            <Settings size={20} className="text-brass-500" />
            {t('writerMemory.heading')}
          </h2>
          <p className="text-sepia-600 text-sm leading-relaxed">
            {t.rich('writerMemory.description', {
              link: (chunks) => <a className="underline hover:text-sepia-800" href="/writing-map">{chunks}</a>,
            })}
          </p>
          <p className="text-xs text-sepia-600 font-mono">
            {t('writerMemory.remembered', { count: insightCount })}
          </p>
          <BrassButton onClick={handleClearMemory} disabled={insightCount === 0} icon={<Trash2 size={18} />}>
            {t('writerMemory.forgetAll')}
          </BrassButton>
        </ParchmentCard>

        {/* MP-07 / Phase 4.5 — native browser spellcheck toggle */}
        <ParchmentCard className="space-y-4">
          <h2 className="text-xl font-serif font-semibold text-sepia-900 flex items-center gap-2">
            <SpellCheck size={20} className="text-brass-500" />
            {t('spellcheck.heading')}
          </h2>
          <p className="text-sepia-600 text-sm leading-relaxed">
            {t('spellcheck.description')}
          </p>
          <label className="inline-flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={spellcheck.enabled}
              onChange={spellcheck.toggle}
              aria-label={t('spellcheck.ariaLabel')}
              className="h-4 w-4 accent-brass-500"
            />
            <span className="text-sm text-sepia-700">
              {t('spellcheck.status', { state: spellcheck.enabled ? tCommon('on') : tCommon('off') })}
            </span>
          </label>
          <p className="text-xs text-sepia-600/80">
            {t.rich('spellcheck.roadmap', {
              code: (chunks) => <code className="font-mono text-[10px] bg-parchment-200 px-1 rounded">{chunks}</code>,
            })}
          </p>
        </ParchmentCard>

        <ParchmentCard className="space-y-4">
          <h2 className="text-xl font-serif font-semibold text-sepia-900 flex items-center gap-2">
            <Download size={20} className="text-brass-500" />
            {t('exportProject.heading')}
          </h2>
          <p className="text-sepia-600 text-sm leading-relaxed">
            {t('exportProject.description')}
          </p>
          <BrassButton onClick={handleExport} icon={<Download size={18} />}>
            {t('exportProject.button')}
          </BrassButton>
        </ParchmentCard>

        <ParchmentCard className="space-y-4">
          <h2 className="text-xl font-serif font-semibold text-sepia-900 flex items-center gap-2">
            <Upload size={20} className="text-brass-500" />
            {t('restoreProject.heading')}
          </h2>
          <p className="text-sepia-600 text-sm leading-relaxed">
            {t('restoreProject.description')}
          </p>
          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            onChange={handleImport}
            className="hidden"
          />
          <BrassButton onClick={() => fileInputRef.current?.click()} icon={<Upload size={18} />}>
            {t('restoreProject.button')}
          </BrassButton>
        </ParchmentCard>

        <ParchmentCard className="space-y-4">
          <h2 className="text-xl font-serif font-semibold text-sepia-900 flex items-center gap-2">
            <BarChart3 size={20} className="text-brass-500" />
            {t('analytics.heading')}
          </h2>
          <p className="text-sepia-600 text-sm leading-relaxed">
            {t('analytics.description')}
          </p>
          {dnt ? (
            <p className="text-xs text-sepia-600/80">
              {t('analytics.dntNote')}
            </p>
          ) : (
            <label className="inline-flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent === 'granted'}
                onChange={() => {
                  const next = consent !== 'granted';
                  setConsent(next ? 'granted' : 'denied');
                  toast(
                    next ? t('analytics.enabled') : t('analytics.disabled'),
                    'success',
                  );
                }}
                aria-label={t('analytics.ariaLabel')}
                className="h-4 w-4 accent-brass-500"
              />
              <span className="text-sm text-sepia-700">
                {t('analytics.status', { state: consent === 'granted' ? tCommon('on') : tCommon('off') })}
              </span>
            </label>
          )}
        </ParchmentCard>

        <ParchmentCard className="space-y-4">
          <h2 className="text-xl font-serif font-semibold text-sepia-900 flex items-center gap-2">
            <Compass size={20} className="text-brass-500" />
            {t('onboarding.heading')}
          </h2>
          <p className="text-sepia-600 text-sm leading-relaxed">
            {t('onboarding.description')}
          </p>
          <BrassButton
            onClick={() => {
              localStorage.removeItem('zagafy_tour_completed');
              router.push('/');
            }}
            icon={<Compass size={18} />}
          >
            {t('onboarding.button')}
          </BrassButton>
        </ParchmentCard>

        <section className="bg-wax-900/10 border border-wax-700/30 rounded-xl p-6 space-y-4">
          <h2 className="text-xl font-serif font-semibold text-wax-700 flex items-center gap-2">
            <AlertTriangle size={20} />
            {t('danger.heading')}
          </h2>
          <p className="text-sepia-600 text-sm leading-relaxed">
            {t('danger.description')}
          </p>
          <InkStampButton
            onClick={handleClear}
            variant="danger"
            icon={<Trash2 size={18} />}
          >
            {t('danger.button')}
          </InkStampButton>
        </section>
      </div>
    </div>
  );
}
