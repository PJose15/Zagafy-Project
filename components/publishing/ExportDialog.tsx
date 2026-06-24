'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Download, Loader2, FileText, FileType2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { springs } from '@/lib/animations';
import { useStory } from '@/lib/store';
import { InkStampButton, ParchmentInput, ParchmentTextarea } from '@/components/antiquarian';
import { requestManuscriptExport, type ExportRequest } from '@/lib/export/client';
import { contentToParagraphs } from '@/lib/export/manuscript-model';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

type Format = 'docx' | 'pdf';

/**
 * Word count that mirrors the server's export model exactly: it runs the same
 * `contentToParagraphs` parser and excludes scene-break separators ("* * *").
 * Using the plain `wordCount` here counted scene-break glyphs as words, so a
 * scene-break-only chapter looked exportable but the server returned
 * "Nothing to export".
 */
function manuscriptWordCount(content: string): number {
  return contentToParagraphs(content).reduce((sum, p) => {
    if (p.sceneBreak) return sum;
    const t = p.runs.map(r => r.text).join('').trim();
    return t ? sum + t.split(/\s+/).filter(Boolean).length : sum;
  }, 0);
}

export function ExportDialog({ open, onClose }: ExportDialogProps) {
  const t = useTranslations('exportDialog');
  const { state, updateField } = useStory();

  const exportableChapters = useMemo(
    () => state.chapters.filter(c => c.canonStatus !== 'discarded'),
    [state.chapters],
  );

  const [format, setFormat] = useState<Format>('docx');
  const [titlePage, setTitlePage] = useState(true);
  const [authorName, setAuthorName] = useState(state.author_name);
  const [authorEmail, setAuthorEmail] = useState(state.author_email);
  const [authorAddress, setAuthorAddress] = useState(state.author_address);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(exportableChapters.map(c => c.id)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Reset transient state and re-seed from store each time the dialog opens.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open && !prevOpen) {
    setPrevOpen(true);
    setAuthorName(state.author_name);
    setAuthorEmail(state.author_email);
    setAuthorAddress(state.author_address);
    setSelected(new Set(exportableChapters.map(c => c.id)));
    setError(null);
    setDone(false);
    setBusy(false);
  }
  if (!open && prevOpen) setPrevOpen(false);

  const toggleChapter = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedChapters = exportableChapters.filter(c => selected.has(c.id));
  const totalWords = selectedChapters.reduce((sum, c) => sum + manuscriptWordCount(c.content), 0);
  const canExport = selectedChapters.length > 0 && totalWords > 0 && !busy;

  const handleExport = async () => {
    if (!canExport) return;
    setBusy(true);
    setError(null);
    setDone(false);

    // Persist author metadata so it's remembered next time.
    if (authorName !== state.author_name) updateField('author_name', authorName);
    if (authorEmail !== state.author_email) updateField('author_email', authorEmail);
    if (authorAddress !== state.author_address) updateField('author_address', authorAddress);

    const req: ExportRequest = {
      format,
      title: state.title,
      author: { name: authorName, email: authorEmail || undefined, address: authorAddress || undefined },
      options: { titlePage },
      chapters: selectedChapters.map(c => ({ title: c.title, content: c.content })),
    };

    const result = await requestManuscriptExport(req);
    if (result.ok) {
      setDone(true);
    } else {
      setError(result.message);
    }
    setBusy(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-start justify-center pt-12 px-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-dialog-title"
        >
          <div className="absolute inset-0 bg-sepia-900/60 backdrop-blur-sm" onClick={busy ? undefined : onClose} />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={springs.gentle}
            className="relative bg-parchment-100 border border-sepia-300/50 rounded-xl shadow-card-hover max-w-xl w-full mb-12 flex flex-col texture-parchment"
          >
            <div className="flex items-center justify-between p-4 border-b border-sepia-300/30">
              <div className="flex items-center gap-2">
                <Download size={18} className="text-brass-500" />
                <h2 id="export-dialog-title" className="font-serif font-semibold text-sepia-900">
                  {t('title')}
                </h2>
              </div>
              <button
                onClick={onClose}
                disabled={busy}
                className="p-1 rounded-full text-sepia-600 hover:text-sepia-800 hover:bg-sepia-300/30 disabled:opacity-40"
                aria-label={t('close')}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-5 max-h-[60vh] overflow-y-auto">
              {/* Format */}
              <div>
                <p className="text-sm font-medium text-sepia-800 mb-2">{t('format')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: 'docx' as Format, label: t('formatDocx'), icon: <FileText size={16} /> },
                    { id: 'pdf' as Format, label: t('formatPdf'), icon: <FileType2 size={16} /> },
                  ]).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setFormat(opt.id)}
                      className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                        format === opt.id
                          ? 'border-brass-500/60 bg-brass-300/30 text-sepia-900'
                          : 'border-sepia-300/50 text-sepia-600 hover:bg-parchment-200/60'
                      }`}
                      aria-pressed={format === opt.id}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-sepia-600 mt-1.5">
                  {t('formatNote')}
                </p>
              </div>

              {/* Title page + author */}
              <div className="space-y-3">
                <label className="inline-flex items-center gap-2 text-sm text-sepia-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={titlePage}
                    onChange={e => setTitlePage(e.target.checked)}
                    className="accent-brass-500"
                  />
                  {t('includeTitlePage')}
                </label>

                {titlePage && (
                  <div className="space-y-3 pl-1">
                    <ParchmentInput
                      label={t('authorName')}
                      placeholder={t('authorNamePlaceholder')}
                      value={authorName}
                      onChange={e => setAuthorName(e.target.value)}
                    />
                    <ParchmentInput
                      label={t('email')}
                      placeholder={t('emailPlaceholder')}
                      value={authorEmail}
                      onChange={e => setAuthorEmail(e.target.value)}
                    />
                    <ParchmentTextarea
                      label={t('mailingAddress')}
                      placeholder={t('mailingPlaceholder')}
                      value={authorAddress}
                      onChange={e => setAuthorAddress(e.target.value)}
                      className="min-h-[60px]"
                      spellCheck={false}
                    />
                  </div>
                )}
              </div>

              {/* Chapter selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-sepia-800">{t('chapters')}</p>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelected(new Set(exportableChapters.map(c => c.id)))}
                      className="text-brass-700 hover:text-brass-900 underline"
                    >
                      {t('all')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelected(new Set())}
                      className="text-brass-700 hover:text-brass-900 underline"
                    >
                      {t('none')}
                    </button>
                  </div>
                </div>

                {exportableChapters.length === 0 ? (
                  <p className="text-sm text-sepia-600 italic">{t('noChapters')}</p>
                ) : (
                  <ul className="space-y-1 border border-sepia-300/40 rounded-lg p-2 max-h-48 overflow-y-auto">
                    {exportableChapters.map(c => (
                      <li key={c.id}>
                        <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-parchment-200/60 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selected.has(c.id)}
                            onChange={() => toggleChapter(c.id)}
                            className="accent-brass-500"
                          />
                          <span className="flex-1 text-sm text-sepia-800 truncate">{c.title || t('untitled')}</span>
                          <span className="text-xs text-sepia-600 font-mono">
                            {t('wordsShort', { count: manuscriptWordCount(c.content) })}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 text-sm text-wax-700 bg-wax-500/10 border border-wax-500/30 rounded-lg p-2">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {done && (
                <div className="flex items-start gap-2 text-sm text-forest-700 bg-forest-500/10 border border-forest-500/30 rounded-lg p-2">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                  <span>{t('downloadingNote', { format: format.toUpperCase() })}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between p-4 border-t border-sepia-300/30 gap-3">
              <span className="text-sm text-sepia-600 font-mono">
                {t('summary', { chapters: selectedChapters.length, words: totalWords })}
              </span>
              <div className="flex items-center gap-2">
                <InkStampButton variant="ghost" size="sm" onClick={onClose} disabled={busy}>
                  {t('close')}
                </InkStampButton>
                <InkStampButton
                  variant="primary"
                  size="sm"
                  onClick={handleExport}
                  disabled={!canExport}
                  icon={busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                >
                  {busy ? t('generating') : t('exportFormat', { format: format.toUpperCase() })}
                </InkStampButton>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
