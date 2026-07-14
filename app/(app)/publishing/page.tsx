'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'motion/react';
import { fadeUp } from '@/lib/animations';
import { ParchmentCard, BrassButton, CarvedHeader, ParchmentInput, ParchmentTextarea, ParchmentSelect } from '@/components/antiquarian';
import { useStory } from '@/lib/store';
import { useConfirm } from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { wordCount } from '@/lib/editor/serialization';
import { ExportDialog } from '@/components/publishing/ExportDialog';
import { BookOpen, FileText, Send, Search, Table2, Plus, Trash2, Edit3, Check, X, Download, Megaphone, Sparkles, Quote, Copy } from 'lucide-react';

type Tab = 'kdp' | 'query' | 'synopsis' | 'comp' | 'blurb' | 'marketing' | 'logline' | 'tracker';

interface Submission {
  id: string;
  agentName: string;
  agency: string;
  dateSent: string;
  status: 'queried' | 'requested' | 'rejected' | 'accepted';
  notes: string;
}

const STORAGE_KEY = 'zagafy_submissions';

/** Copies a generated result to the clipboard with toast feedback. */
function CopyResultButton({ text }: { text: string }) {
  const t = useTranslations('publishing');
  const { toast } = useToast();
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast(t('copiedToast'), 'success');
    } catch {
      toast(t('copyFailedToast'), 'error');
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs text-cream-300/60 hover:text-brass-300 transition-colors"
    >
      <Copy size={13} aria-hidden="true" />
      {t('copyResult')}
    </button>
  );
}

function loadSubmissions(): Submission[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSubmissions(subs: Submission[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
}

export default function PublishingPage() {
  const [tab, setTab] = useState<Tab>('kdp');
  const [exportOpen, setExportOpen] = useState(false);
  const { state } = useStory();
  const t = useTranslations('publishing');
  const tCommon = useTranslations('common');
  const { confirm } = useConfirm();
  const genErr = useCallback(
    (data: { message?: string; error?: string }) =>
      `${t('errorPrefix')}: ${data.message || data.error || t('failedToGenerate')}`,
    [t],
  );
  const statusKey: Record<Submission['status'], string> = {
    queried: 'tracker.statusQueried',
    requested: 'tracker.statusRequested',
    rejected: 'tracker.statusRejected',
    accepted: 'tracker.statusAccepted',
  };
  const statusLabel = (s: Submission['status']) => t(statusKey[s]);

  // --- KDP ---
  const totalWords = state.chapters.reduce((s, c) => s + (c.content ? wordCount(c.content) : 0), 0);
  const kdpPreview = `KDP Formatting Preview
━━━━━━━━━━━━━━━━━━━━━━━━
Title: ${state.title || 'Untitled'}
Word Count: ${totalWords.toLocaleString()}
Chapters: ${state.chapters.length}

Recommended KDP Settings:
• Font: 12pt Times New Roman
• Margins: 1" all sides
• Line Spacing: Double-spaced
• Page Size: 6" x 9" (standard trade)
• Headers: Chapter title, right-aligned
• Page Numbers: Bottom center, starting after front matter

Front Matter Order:
  1. Title Page
  2. Copyright Page
  3. Dedication (optional)
  4. Table of Contents

Chapter Formatting:
  • Start each chapter on a new page
  • Chapter title: 14pt, bold, centered
  • First paragraph: No indent
  • Body paragraphs: 0.5" first-line indent
  • Scene breaks: Centered "* * *"

Use "Export manuscript" below for a standard-format .docx or .pdf.`;

  // --- Query Letter ---
  const [queryForm, setQueryForm] = useState({ agentName: '', agencyName: '', genrePrefs: '' });
  const [queryLetter, setQueryLetter] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);

  const generateQueryLetter = useCallback(async () => {
    setQueryLoading(true);
    try {
      const res = await fetch('/api/publishing/query-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: state.title,
          genre: state.genre || queryForm.genrePrefs,
          synopsis: state.synopsis || 'A compelling story.',
          protagonistName: state.characters?.[0]?.name || '',
          agentName: queryForm.agentName,
          agencyName: queryForm.agencyName,
          language: state.language || 'English',
        }),
      });
      const data = await res.json();
      if (data.ok) setQueryLetter(data.letter || data.data?.letter || '');
      else setQueryLetter(genErr(data));
    } catch {
      setQueryLetter(tCommon('networkError'));
    } finally {
      setQueryLoading(false);
    }
  }, [state, queryForm, genErr, tCommon]);

  // --- Synopsis ---
  const [synopsisResult, setSynopsisResult] = useState('');
  const [synopsisLoading, setSynopsisLoading] = useState(false);

  const generateSynopsis = useCallback(async (length: '1-page' | '5-page') => {
    setSynopsisLoading(true);
    try {
      const chapterSummaries = state.chapters.map((c, i) => `Ch ${i + 1}: ${c.title || 'Untitled'}`).join('\n');
      const charList = state.characters?.map(c => `${c.name} (${c.role})`).join(', ') || '';
      const res = await fetch('/api/publishing/synopsis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          length,
          title: state.title,
          genre: state.genre || '',
          synopsis: state.synopsis || '',
          chapters: chapterSummaries,
          characters: charList,
          language: state.language || 'English',
        }),
      });
      const data = await res.json();
      if (data.ok) setSynopsisResult(data.synopsis || data.data?.synopsis || '');
      else setSynopsisResult(genErr(data));
    } catch {
      setSynopsisResult(tCommon('networkError'));
    } finally {
      setSynopsisLoading(false);
    }
  }, [state, genErr, tCommon]);

  // --- Comp Titles ---
  const [compTitles, setCompTitles] = useState<Array<{ title: string; author: string; year: number; rationale: string }>>([]);
  const [compLoading, setCompLoading] = useState(false);

  const findCompTitles = useCallback(async () => {
    setCompLoading(true);
    try {
      const res = await fetch('/api/publishing/comp-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: state.title,
          genre: state.genre || '',
          tones: '',
          themes: '',
          language: state.language || 'English',
        }),
      });
      const data = await res.json();
      if (data.ok) setCompTitles(data.compTitles || data.data?.compTitles || []);
      else setCompTitles([]);
    } catch {
      setCompTitles([]);
    } finally {
      setCompLoading(false);
    }
  }, [state]);

  // --- Back-Cover Blurb ---
  const [blurb, setBlurb] = useState('');
  const [blurbLoading, setBlurbLoading] = useState(false);

  const generateBlurb = useCallback(async () => {
    setBlurbLoading(true);
    try {
      const res = await fetch('/api/publishing/blurb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: state.title,
          genre: state.genre || '',
          synopsis: state.synopsis || '',
          protagonistName: state.characters?.[0]?.name || '',
          tone: '',
          language: state.language || 'English',
        }),
      });
      const data = await res.json();
      if (data.ok) setBlurb(data.blurb || data.data?.blurb || '');
      else setBlurb(genErr(data));
    } catch {
      setBlurb(tCommon('networkError'));
    } finally {
      setBlurbLoading(false);
    }
  }, [state, genErr, tCommon]);

  // --- Marketing / Amazon Copy ---
  const [marketing, setMarketing] = useState('');
  const [marketingLoading, setMarketingLoading] = useState(false);

  const generateMarketing = useCallback(async () => {
    setMarketingLoading(true);
    try {
      const res = await fetch('/api/publishing/marketing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: state.title,
          genre: state.genre || '',
          synopsis: state.synopsis || '',
          tones: '',
          themes: '',
          language: state.language || 'English',
        }),
      });
      const data = await res.json();
      if (data.ok) setMarketing(data.marketing || data.data?.marketing || '');
      else setMarketing(genErr(data));
    } catch {
      setMarketing(tCommon('networkError'));
    } finally {
      setMarketingLoading(false);
    }
  }, [state, genErr, tCommon]);

  // --- Logline / Elevator Pitch ---
  const [logline, setLogline] = useState('');
  const [loglineLoading, setLoglineLoading] = useState(false);

  const generateLogline = useCallback(async () => {
    setLoglineLoading(true);
    try {
      const res = await fetch('/api/publishing/logline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: state.title,
          genre: state.genre || '',
          synopsis: state.synopsis || '',
          protagonistName: state.characters?.[0]?.name || '',
          language: state.language || 'English',
        }),
      });
      const data = await res.json();
      if (data.ok) setLogline(data.logline || data.data?.logline || '');
      else setLogline(genErr(data));
    } catch {
      setLogline(tCommon('networkError'));
    } finally {
      setLoglineLoading(false);
    }
  }, [state, genErr, tCommon]);

  // --- Submission Tracker ---
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Submission | null>(null);
  const [showAddRow, setShowAddRow] = useState(false);
  const [newRow, setNewRow] = useState<Omit<Submission, 'id'>>({ agentName: '', agency: '', dateSent: new Date().toISOString().slice(0, 10), status: 'queried', notes: '' });

  useEffect(() => { setSubmissions(loadSubmissions()); }, []);
  useEffect(() => { if (submissions.length > 0 || loadSubmissions().length > 0) saveSubmissions(submissions); }, [submissions]);

  const addSubmission = () => {
    if (!newRow.agentName) return;
    setSubmissions(prev => [...prev, { ...newRow, id: crypto.randomUUID() }]);
    setNewRow({ agentName: '', agency: '', dateSent: new Date().toISOString().slice(0, 10), status: 'queried', notes: '' });
    setShowAddRow(false);
  };

  const deleteSubmission = async (id: string) => {
    const sub = submissions.find(s => s.id === id);
    const confirmed = await confirm({
      title: t('tracker.deleteConfirmTitle'),
      message: t('tracker.deleteConfirmMessage', { agent: sub?.agentName || t('tracker.deleteConfirmFallback') }),
      confirmLabel: tCommon('delete'),
      variant: 'danger',
    });
    if (!confirmed) return;
    setSubmissions(prev => prev.filter(s => s.id !== id));
  };

  const startEdit = (sub: Submission) => { setEditingId(sub.id); setEditDraft({ ...sub }); };
  const cancelEdit = () => { setEditingId(null); setEditDraft(null); };
  const saveEdit = () => {
    if (!editDraft) return;
    setSubmissions(prev => prev.map(s => s.id === editDraft.id ? editDraft : s));
    setEditingId(null);
    setEditDraft(null);
  };

  const tabs: { key: Tab; icon: React.ReactNode }[] = [
    { key: 'kdp', icon: <BookOpen size={16} /> },
    { key: 'query', icon: <FileText size={16} /> },
    { key: 'synopsis', icon: <Send size={16} /> },
    { key: 'comp', icon: <Search size={16} /> },
    { key: 'blurb', icon: <Quote size={16} /> },
    { key: 'marketing', icon: <Megaphone size={16} /> },
    { key: 'logline', icon: <Sparkles size={16} /> },
    { key: 'tracker', icon: <Table2 size={16} /> },
  ];

  const statusColors: Record<string, string> = {
    queried: 'text-brass-400',
    requested: 'text-blue-400',
    rejected: 'text-red-400',
    accepted: 'text-green-400',
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <CarvedHeader title={t('title')} subtitle={t('subtitle')} />

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map(tb => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === tb.key
                ? 'bg-brass-500/20 text-brass-300 border border-brass-500/40'
                : 'text-cream-300/60 hover:bg-mahogany-800/50 hover:text-cream-100 border border-transparent'
            }`}
          >
            {tb.icon}
            {t(`tabs.${tb.key}`)}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
      <motion.div key={tab} {...fadeUp}>

      {/* KDP Export Tab */}
      {tab === 'kdp' && (
        <ParchmentCard>
          <h3 className="font-serif text-lg text-cream-100 mb-4">{t('kdp.heading')}</h3>
          <pre className="whitespace-pre-wrap text-sm text-cream-300/80 font-mono bg-mahogany-900/50 p-4 rounded-lg border border-mahogany-700/30 leading-relaxed">
            {kdpPreview}
          </pre>
          <div className="mt-4">
            <BrassButton onClick={() => setExportOpen(true)} disabled={state.chapters.length === 0}>
              <Download size={16} className="mr-2" />
              {t('kdp.exportButton')}
            </BrassButton>
            {state.chapters.length === 0 && (
              <p className="text-xs text-cream-300/60 mt-2">{t('kdp.noChapters')}</p>
            )}
          </div>
        </ParchmentCard>
      )}

      {/* Query Letter Tab */}
      {tab === 'query' && (
        <ParchmentCard>
          <h3 className="font-serif text-lg text-cream-100 mb-4">{t('query.heading')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <ParchmentInput
              label={t('query.targetAgent')}
              placeholder={t('query.agentPlaceholder')}
              value={queryForm.agentName}
              onChange={e => setQueryForm(f => ({ ...f, agentName: e.target.value }))}
            />
            <ParchmentInput
              label={t('query.agency')}
              placeholder={t('query.agencyPlaceholder')}
              value={queryForm.agencyName}
              onChange={e => setQueryForm(f => ({ ...f, agencyName: e.target.value }))}
            />
            <ParchmentInput
              label={t('query.genrePrefs')}
              placeholder={t('query.genrePlaceholder')}
              value={queryForm.genrePrefs}
              onChange={e => setQueryForm(f => ({ ...f, genrePrefs: e.target.value }))}
            />
          </div>
          <BrassButton onClick={generateQueryLetter} disabled={queryLoading}>
            <FileText size={16} className="mr-2" />
            {queryLoading ? tCommon('generating') : t('query.generate')}
          </BrassButton>
          {queryLetter && (
            <div className="mt-4 space-y-2">
              <ParchmentTextarea
                label={t('query.resultLabel')}
                value={queryLetter}
                onChange={e => setQueryLetter(e.target.value)}
                rows={16}
              />
              <div className="flex justify-end"><CopyResultButton text={queryLetter} /></div>
            </div>
          )}
        </ParchmentCard>
      )}

      {/* Synopsis Tab */}
      {tab === 'synopsis' && (
        <ParchmentCard>
          <h3 className="font-serif text-lg text-cream-100 mb-4">{t('synopsis.heading')}</h3>
          <div className="flex gap-3 mb-4">
            <BrassButton onClick={() => generateSynopsis('1-page')} disabled={synopsisLoading}>
              <FileText size={16} className="mr-2" />
              {synopsisLoading ? tCommon('generating') : t('synopsis.generate1')}
            </BrassButton>
            <BrassButton onClick={() => generateSynopsis('5-page')} disabled={synopsisLoading}>
              <FileText size={16} className="mr-2" />
              {synopsisLoading ? tCommon('generating') : t('synopsis.generate5')}
            </BrassButton>
          </div>
          {synopsisResult && (
            <div className="mt-2 space-y-2">
              <ParchmentTextarea
                label={t('synopsis.resultLabel')}
                value={synopsisResult}
                onChange={e => setSynopsisResult(e.target.value)}
                rows={20}
              />
              <div className="flex justify-end"><CopyResultButton text={synopsisResult} /></div>
            </div>
          )}
        </ParchmentCard>
      )}

      {/* Comp Titles Tab */}
      {tab === 'comp' && (
        <ParchmentCard>
          <h3 className="font-serif text-lg text-cream-100 mb-4">{t('comp.heading')}</h3>
          <BrassButton onClick={findCompTitles} disabled={compLoading}>
            <Search size={16} className="mr-2" />
            {compLoading ? t('comp.searching') : t('comp.find')}
          </BrassButton>
          {compTitles.length > 0 && (
            <div className="mt-4 space-y-4">
              {compTitles.map((ct, i) => (
                <div key={i} className="p-4 bg-mahogany-900/50 rounded-lg border border-mahogany-700/30">
                  <h4 className="font-serif text-cream-100 font-semibold">
                    {ct.title} <span className="text-brass-400 font-normal">{t('comp.by')} {ct.author}</span>
                    {ct.year > 0 && <span className="text-cream-300/50 text-sm ml-2">({ct.year})</span>}
                  </h4>
                  <p className="text-cream-300/70 text-sm mt-2">{ct.rationale}</p>
                </div>
              ))}
            </div>
          )}
        </ParchmentCard>
      )}

      {/* Back-Cover Blurb Tab */}
      {tab === 'blurb' && (
        <ParchmentCard>
          <h3 className="font-serif text-lg text-cream-100 mb-2">{t('blurb.heading')}</h3>
          <p className="text-sm text-cream-300/60 mb-4">
            {t('blurb.description')}
          </p>
          <BrassButton onClick={generateBlurb} disabled={blurbLoading || !state.title}>
            <Quote size={16} className="mr-2" />
            {blurbLoading ? tCommon('generating') : t('blurb.generate')}
          </BrassButton>
          {!state.title && (
            <p className="text-xs text-cream-300/60 mt-2">{t('blurb.needTitle')}</p>
          )}
          {blurb && (
            <div className="mt-4 space-y-2">
              <ParchmentTextarea
                label={t('blurb.resultLabel')}
                value={blurb}
                onChange={e => setBlurb(e.target.value)}
                rows={10}
              />
              <div className="flex justify-end"><CopyResultButton text={blurb} /></div>
            </div>
          )}
        </ParchmentCard>
      )}

      {/* Marketing Copy Tab */}
      {tab === 'marketing' && (
        <ParchmentCard>
          <h3 className="font-serif text-lg text-cream-100 mb-2">{t('marketing.heading')}</h3>
          <p className="text-sm text-cream-300/60 mb-4">
            {t('marketing.description')}
          </p>
          <BrassButton onClick={generateMarketing} disabled={marketingLoading || !state.title}>
            <Megaphone size={16} className="mr-2" />
            {marketingLoading ? tCommon('generating') : t('marketing.generate')}
          </BrassButton>
          {!state.title && (
            <p className="text-xs text-cream-300/60 mt-2">{t('marketing.needTitle')}</p>
          )}
          {marketing && (
            <div className="mt-4 space-y-2">
              <ParchmentTextarea
                label={t('marketing.resultLabel')}
                value={marketing}
                onChange={e => setMarketing(e.target.value)}
                rows={20}
              />
              <div className="flex justify-end"><CopyResultButton text={marketing} /></div>
            </div>
          )}
        </ParchmentCard>
      )}

      {/* Logline Tab */}
      {tab === 'logline' && (
        <ParchmentCard>
          <h3 className="font-serif text-lg text-cream-100 mb-2">{t('logline.heading')}</h3>
          <p className="text-sm text-cream-300/60 mb-4">
            {t('logline.description')}
          </p>
          <BrassButton onClick={generateLogline} disabled={loglineLoading || !state.title}>
            <Sparkles size={16} className="mr-2" />
            {loglineLoading ? tCommon('generating') : t('logline.generate')}
          </BrassButton>
          {!state.title && (
            <p className="text-xs text-cream-300/60 mt-2">{t('logline.needTitle')}</p>
          )}
          {logline && (
            <div className="mt-4 space-y-2">
              <ParchmentTextarea
                label={t('logline.resultLabel')}
                value={logline}
                onChange={e => setLogline(e.target.value)}
                rows={12}
              />
              <div className="flex justify-end"><CopyResultButton text={logline} /></div>
            </div>
          )}
        </ParchmentCard>
      )}

      {/* Submission Tracker Tab */}
      {tab === 'tracker' && (
        <ParchmentCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif text-lg text-cream-100">{t('tracker.heading')}</h3>
            <BrassButton onClick={() => setShowAddRow(true)}>
              <Plus size={16} className="mr-2" />
              {t('tracker.add')}
            </BrassButton>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-mahogany-700/40 text-cream-300/60 text-left">
                  <th className="py-2 pr-3">{t('tracker.agent')}</th>
                  <th className="py-2 pr-3">{t('tracker.agency')}</th>
                  <th className="py-2 pr-3">{t('tracker.dateSent')}</th>
                  <th className="py-2 pr-3">{t('tracker.status')}</th>
                  <th className="py-2 pr-3">{t('tracker.notes')}</th>
                  <th className="py-2 w-20">{t('tracker.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {showAddRow && (
                  <tr className="border-b border-mahogany-700/20">
                    <td className="py-2 pr-2"><input className="w-full bg-mahogany-900/50 border border-mahogany-700/30 rounded px-2 py-1 text-cream-100 text-sm" value={newRow.agentName} onChange={e => setNewRow(r => ({ ...r, agentName: e.target.value }))} placeholder={t('query.agentPlaceholder')} /></td>
                    <td className="py-2 pr-2"><input className="w-full bg-mahogany-900/50 border border-mahogany-700/30 rounded px-2 py-1 text-cream-100 text-sm" value={newRow.agency} onChange={e => setNewRow(r => ({ ...r, agency: e.target.value }))} placeholder={t('tracker.agency')} /></td>
                    <td className="py-2 pr-2"><input type="date" className="bg-mahogany-900/50 border border-mahogany-700/30 rounded px-2 py-1 text-cream-100 text-sm" value={newRow.dateSent} onChange={e => setNewRow(r => ({ ...r, dateSent: e.target.value }))} /></td>
                    <td className="py-2 pr-2">
                      <select className="bg-mahogany-900/50 border border-mahogany-700/30 rounded px-2 py-1 text-cream-100 text-sm" value={newRow.status} onChange={e => setNewRow(r => ({ ...r, status: e.target.value as Submission['status'] }))}>
                        <option value="queried">{t('tracker.statusQueried')}</option>
                        <option value="requested">{t('tracker.statusRequested')}</option>
                        <option value="rejected">{t('tracker.statusRejected')}</option>
                        <option value="accepted">{t('tracker.statusAccepted')}</option>
                      </select>
                    </td>
                    <td className="py-2 pr-2"><input className="w-full bg-mahogany-900/50 border border-mahogany-700/30 rounded px-2 py-1 text-cream-100 text-sm" value={newRow.notes} onChange={e => setNewRow(r => ({ ...r, notes: e.target.value }))} placeholder={t('tracker.notes')} /></td>
                    <td className="py-2 flex gap-1">
                      <button onClick={addSubmission} className="text-green-400 hover:text-green-300 p-1"><Check size={16} /></button>
                      <button onClick={() => setShowAddRow(false)} className="text-red-400 hover:text-red-300 p-1"><X size={16} /></button>
                    </td>
                  </tr>
                )}
                {submissions.map(sub => (
                  <tr key={sub.id} className="border-b border-mahogany-700/20">
                    {editingId === sub.id && editDraft ? (
                      <>
                        <td className="py-2 pr-2"><input className="w-full bg-mahogany-900/50 border border-mahogany-700/30 rounded px-2 py-1 text-cream-100 text-sm" value={editDraft.agentName} onChange={e => setEditDraft(d => d ? { ...d, agentName: e.target.value } : d)} /></td>
                        <td className="py-2 pr-2"><input className="w-full bg-mahogany-900/50 border border-mahogany-700/30 rounded px-2 py-1 text-cream-100 text-sm" value={editDraft.agency} onChange={e => setEditDraft(d => d ? { ...d, agency: e.target.value } : d)} /></td>
                        <td className="py-2 pr-2"><input type="date" className="bg-mahogany-900/50 border border-mahogany-700/30 rounded px-2 py-1 text-cream-100 text-sm" value={editDraft.dateSent} onChange={e => setEditDraft(d => d ? { ...d, dateSent: e.target.value } : d)} /></td>
                        <td className="py-2 pr-2">
                          <select className="bg-mahogany-900/50 border border-mahogany-700/30 rounded px-2 py-1 text-cream-100 text-sm" value={editDraft.status} onChange={e => setEditDraft(d => d ? { ...d, status: e.target.value as Submission['status'] } : d)}>
                            <option value="queried">{t('tracker.statusQueried')}</option>
                            <option value="requested">{t('tracker.statusRequested')}</option>
                            <option value="rejected">{t('tracker.statusRejected')}</option>
                            <option value="accepted">{t('tracker.statusAccepted')}</option>
                          </select>
                        </td>
                        <td className="py-2 pr-2"><input className="w-full bg-mahogany-900/50 border border-mahogany-700/30 rounded px-2 py-1 text-cream-100 text-sm" value={editDraft.notes} onChange={e => setEditDraft(d => d ? { ...d, notes: e.target.value } : d)} /></td>
                        <td className="py-2 flex gap-1">
                          <button onClick={saveEdit} className="text-green-400 hover:text-green-300 p-1"><Check size={16} /></button>
                          <button onClick={cancelEdit} className="text-red-400 hover:text-red-300 p-1"><X size={16} /></button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-3 text-cream-100">{sub.agentName}</td>
                        <td className="py-2 pr-3 text-cream-300/70">{sub.agency}</td>
                        <td className="py-2 pr-3 text-cream-300/70">{sub.dateSent}</td>
                        <td className={`py-2 pr-3 font-medium ${statusColors[sub.status] || 'text-cream-300'}`}>{statusLabel(sub.status)}</td>
                        <td className="py-2 pr-3 text-cream-300/60 max-w-[200px] truncate">{sub.notes}</td>
                        <td className="py-2 flex gap-1">
                          <button onClick={() => startEdit(sub)} className="text-brass-400 hover:text-brass-300 p-1"><Edit3 size={16} /></button>
                          <button onClick={() => deleteSubmission(sub.id)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={16} /></button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {submissions.length === 0 && !showAddRow && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-cream-300/40">
                      {t('tracker.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </ParchmentCard>
      )}

      </motion.div>
      </AnimatePresence>

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}
