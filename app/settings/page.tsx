'use client';

import { useStory, StoryState } from '@/lib/store';
import { useRef, useEffect, useState } from 'react';
import { Settings, Download, Upload, Trash2, AlertTriangle, Globe, SpellCheck, BarChart3, Compass } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { BillingSection } from '@/components/billing/billing-section';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm-dialog';
import { HeteronymSettings } from '@/components/heteronyms/heteronym-settings';
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

  useEffect(() => {
    let cancelled = false;
    readWriterInsights().then(list => {
      if (!cancelled) setInsightCount(list.length);
    });
    return () => { cancelled = true; };
  }, []);

  const handleClearMemory = async () => {
    const ok = await confirm({
      title: 'Forget writer memory?',
      message:
        `Clear all ${insightCount} observation${insightCount === 1 ? '' : 's'} the AI coach has built up about your craft? ` +
        'Future suggestions will start fresh. This cannot be undone.',
      confirmLabel: 'Forget all',
      variant: 'danger',
    });
    if (!ok) return;
    await clearAllInsights();
    setInsightCount(0);
    toast('Writer memory cleared.', 'success');
  };

  // Abort any in-flight FileReader on unmount
  useEffect(() => {
    return () => { readerRef.current?.abort(); };
  }, []);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      toast(`Import file is too large (max ${Math.round(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MB).`, 'error');
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
          toast(`Invalid file: ${check.reason}.`, 'error');
          return;
        }
        const validated = data as Record<string, unknown>;
        const confirmed = await confirm({
          title: 'Replace project data?',
          message: 'This will replace ALL current project data with the imported file. A backup of your current data will be saved automatically.',
          confirmLabel: 'Replace Data',
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
        toast('Project data imported successfully.', 'success');
      } catch {
        toast('Failed to parse JSON file. Make sure it is a valid Story Bible export.', 'error');
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
    toast('Project exported successfully.', 'success');
  };

  const handleClear = async () => {
    const confirmed = await confirm({
      title: 'Delete all project data?',
      message: 'This will permanently delete all your project data from local storage. This cannot be undone. Make sure you have exported your data first.',
      confirmLabel: 'Delete Everything',
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
        title="Settings"
        subtitle="Manage your project data and preferences."
        icon={<Settings size={24} />}
      />

      <div className="space-y-8">
        <BillingSection />

        <ParchmentCard className="space-y-4">
          <h2 className="text-xl font-serif font-semibold text-sepia-900 flex items-center gap-2">
            <Globe size={20} className="text-brass-500" />
            Project Language
          </h2>
          <p className="text-sepia-600 text-sm leading-relaxed">
            Set the language for your project. All AI analysis, ingestion, and assistant responses will use this language. Content will never be translated.
          </p>
          <select
            value={state.language || 'English'}
            onChange={(e) => updateField('language', e.target.value)}
            className="bg-parchment-200 border border-sepia-300/60 text-sepia-900 px-4 py-2 rounded-lg font-medium focus:border-brass-500/60 focus:ring-2 focus:ring-brass-400/40 outline-none"
            aria-label="Project language"
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
            Writer Memory
          </h2>
          <p className="text-sepia-600 text-sm leading-relaxed">
            The AI coach builds up observations about your craft (pacing, dialogue,
            description, plot, voice) as you run it. The top three are folded back
            into future micro-prompts and coaching sessions. Browse them under{' '}
            <a className="underline hover:text-sepia-800" href="/writing-map">Writing Map</a>.
          </p>
          <p className="text-xs text-sepia-500 font-mono">
            Currently remembered: {insightCount.toLocaleString()} observation{insightCount === 1 ? '' : 's'}.
          </p>
          <BrassButton onClick={handleClearMemory} disabled={insightCount === 0} icon={<Trash2 size={18} />}>
            Forget all observations
          </BrassButton>
        </ParchmentCard>

        {/* MP-07 / Phase 4.5 — native browser spellcheck toggle */}
        <ParchmentCard className="space-y-4">
          <h2 className="text-xl font-serif font-semibold text-sepia-900 flex items-center gap-2">
            <SpellCheck size={20} className="text-brass-500" />
            Spellcheck
          </h2>
          <p className="text-sepia-600 text-sm leading-relaxed">
            Use the browser&apos;s built-in spellchecker on writing surfaces. Turn this off when
            you&apos;re polishing dialect, made-up names, or invented vocabulary and the red
            squiggles get in the way.
          </p>
          <label className="inline-flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={spellcheck.enabled}
              onChange={spellcheck.toggle}
              aria-label="Enable browser spellcheck"
              className="h-4 w-4 accent-brass-500"
            />
            <span className="text-sm text-sepia-700">
              Browser spellcheck is {spellcheck.enabled ? 'on' : 'off'}
            </span>
          </label>
          <p className="text-xs text-sepia-500/80">
            A richer grammar layer (LanguageTool) is on the roadmap — see{' '}
            <code className="font-mono text-[10px] bg-parchment-200 px-1 rounded">docs/ROADMAP.md</code>.
          </p>
        </ParchmentCard>

        <ParchmentCard className="space-y-4">
          <h2 className="text-xl font-serif font-semibold text-sepia-900 flex items-center gap-2">
            <Download size={20} className="text-brass-500" />
            Export Project
          </h2>
          <p className="text-sepia-600 text-sm leading-relaxed">
            Download your entire Story Bible, manuscript, characters, and timeline as a JSON file. You can use this for backup or to process with other tools.
          </p>
          <BrassButton onClick={handleExport} icon={<Download size={18} />}>
            Export JSON
          </BrassButton>
        </ParchmentCard>

        <ParchmentCard className="space-y-4">
          <h2 className="text-xl font-serif font-semibold text-sepia-900 flex items-center gap-2">
            <Upload size={20} className="text-brass-500" />
            Restore Project
          </h2>
          <p className="text-sepia-600 text-sm leading-relaxed">
            Import a previously exported JSON file to restore your Story Bible. This will replace all current data.
          </p>
          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            onChange={handleImport}
            className="hidden"
          />
          <BrassButton onClick={() => fileInputRef.current?.click()} icon={<Upload size={18} />}>
            Import JSON
          </BrassButton>
        </ParchmentCard>

        <ParchmentCard className="space-y-4">
          <h2 className="text-xl font-serif font-semibold text-sepia-900 flex items-center gap-2">
            <BarChart3 size={20} className="text-brass-500" />
            Analytics
          </h2>
          <p className="text-sepia-600 text-sm leading-relaxed">
            Privacy-friendly analytics help us understand how Zagafy is used. No manuscript
            content is ever collected. Session recordings mask all text.
          </p>
          {dnt ? (
            <p className="text-xs text-sepia-500/80">
              Your browser has Do-Not-Track enabled. Analytics are automatically disabled.
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
                    next
                      ? 'Analytics enabled. Reload for changes to take full effect.'
                      : 'Analytics disabled. Reload for changes to take full effect.',
                    'success',
                  );
                }}
                aria-label="Enable analytics"
                className="h-4 w-4 accent-brass-500"
              />
              <span className="text-sm text-sepia-700">
                Analytics are {consent === 'granted' ? 'on' : 'off'}
              </span>
            </label>
          )}
        </ParchmentCard>

        <ParchmentCard className="space-y-4">
          <h2 className="text-xl font-serif font-semibold text-sepia-900 flex items-center gap-2">
            <Compass size={20} className="text-brass-500" />
            Onboarding Tour
          </h2>
          <p className="text-sepia-600 text-sm leading-relaxed">
            Replay the guided tour that introduces the main areas of Zagafy. Useful if you skipped it during setup or want a quick refresher.
          </p>
          <BrassButton
            onClick={() => {
              localStorage.removeItem('zagafy_tour_completed');
              router.push('/');
            }}
            icon={<Compass size={18} />}
          >
            Restart Tour
          </BrassButton>
        </ParchmentCard>

        <section className="bg-wax-900/10 border border-wax-700/30 rounded-xl p-6 space-y-4">
          <h2 className="text-xl font-serif font-semibold text-wax-700 flex items-center gap-2">
            <AlertTriangle size={20} />
            Danger Zone
          </h2>
          <p className="text-sepia-600 text-sm leading-relaxed">
            Permanently delete all project data from your browser&apos;s local storage. Make sure you have exported your data first if you want to keep it.
          </p>
          <InkStampButton
            onClick={handleClear}
            variant="danger"
            icon={<Trash2 size={18} />}
          >
            Clear All Data
          </InkStampButton>
        </section>
      </div>
    </div>
  );
}
