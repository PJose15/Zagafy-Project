'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'motion/react';
import { Pencil, Check, Trash2, ChevronUp, ChevronDown, Archive } from 'lucide-react';
import { ParchmentCard, ParchmentInput, ParchmentTextarea, WaxSealBadge, useConfirm } from '@/components/antiquarian';
import { type WorldBibleSection } from '@/lib/types/world-bible';
import type { CanonStatus } from '@/lib/store';
import {
  promoteOne,
  demoteOne,
  isDiscarded,
  requiresConfirmConfirmation,
} from '@/lib/canon-promotion';

interface WorldBibleSectionCardProps {
  section: WorldBibleSection;
  onUpdate: (updated: WorldBibleSection) => void;
  onDelete: (id: string) => void;
}

const CANON_OPTIONS: CanonStatus[] = ['confirmed', 'flexible', 'draft', 'discarded'];

export function WorldBibleSectionCard({ section, onUpdate, onDelete }: WorldBibleSectionCardProps) {
  const t = useTranslations('bible');
  const tStatus = useTranslations('canonStatus');
  const tCommon = useTranslations('common');
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [content, setContent] = useState(section.content);
  const { confirm } = useConfirm();

  const handleSave = () => {
    onUpdate({
      ...section,
      title: title.trim(),
      content: content.trim(),
      lastUpdated: new Date().toISOString(),
    });
    setEditing(false);
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: t('sectionDeleteTitle'),
      message: t('sectionDeleteMessage', { title: section.title }),
      confirmLabel: tCommon('delete'),
      variant: 'danger',
    });
    if (ok) onDelete(section.id);
  };

  const setStatus = (newStatus: CanonStatus) =>
    onUpdate({ ...section, canonStatus: newStatus, lastUpdated: new Date().toISOString() });

  const handleCanonChange = async (newStatus: CanonStatus) => {
    if (requiresConfirmConfirmation(section.canonStatus, newStatus)) {
      const ok = await confirm({
        title: t('promoteTitle'),
        message: t('promoteMessage', { title: section.title }),
        confirmLabel: t('promoteConfirm'),
      });
      if (!ok) return;
    }
    setStatus(newStatus);
  };

  const handlePromote = () => handleCanonChange(promoteOne(section.canonStatus));
  const handleDemote = () => setStatus(demoteOne(section.canonStatus));
  const handleDiscard = async () => {
    const ok = await confirm({
      title: t('discardTitle'),
      message: t('discardMessage', { title: section.title }),
      confirmLabel: t('discardConfirm'),
      variant: 'danger',
    });
    if (ok) setStatus('discarded');
  };

  return (
    <ParchmentCard padding="md" className="group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs uppercase tracking-wider text-sepia-600 shrink-0">{t(`category.${section.category}`)}</span>
          {section.source === 'ai-extracted' && (
            <span className="text-[10px] bg-brass-500/10 text-brass-700 px-1.5 py-0.5 rounded-full shrink-0">AI</span>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {editing ? (
            <button
              onClick={handleSave}
              className="p-1.5 rounded-md hover:bg-forest-700/10 text-forest-700 transition-colors"
              aria-label={t('sectionSaveAria')}
            >
              <Check size={16} />
            </button>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-md hover:bg-sepia-300/30 text-sepia-600 transition-colors"
              aria-label={t('editSection')}
            >
              <Pencil size={16} />
            </button>
          )}
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-md hover:bg-wax-500/10 text-sepia-600 hover:text-wax-600 transition-colors"
            aria-label={t('deleteSection')}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
      {editing ? (
        <motion.div
          key="edit"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="mt-3 space-y-3"
        >
          <ParchmentInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="font-serif font-semibold"
            placeholder={t('sectionTitlePlaceholder')}
          />
          <ParchmentTextarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="h-40 text-sm"
            placeholder={t('sectionContentPlaceholder')}
          />
        </motion.div>
      ) : (
        <motion.div
          key="view"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="mt-2"
        >
          <h4 className="font-serif font-semibold text-sepia-900">{section.title}</h4>
          <div className="mt-1 text-sm text-sepia-700 leading-relaxed whitespace-pre-wrap">
            {section.content}
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <WaxSealBadge status={section.canonStatus} />
          <select
            value={section.canonStatus}
            onChange={(e) => handleCanonChange(e.target.value as CanonStatus)}
            className="text-xs bg-transparent text-sepia-600 border-none cursor-pointer focus:outline-none"
            aria-label={t('canonStatusAria')}
          >
            {CANON_OPTIONS.map((s) => (
              <option key={s} value={s}>{tStatus(s)}</option>
            ))}
          </select>
          {/* CB-05: explicit promote / demote / discard buttons */}
          {!isDiscarded(section.canonStatus) && (
            <div className="flex items-center gap-0.5 ml-1" aria-label={t('promotionControls')}>
              <button
                type="button"
                onClick={handlePromote}
                disabled={section.canonStatus === 'confirmed'}
                className="p-1 rounded text-sepia-600 hover:text-forest-700 hover:bg-forest-700/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-sepia-600"
                aria-label={t('promoteAria')}
                title={section.canonStatus === 'confirmed' ? t('alreadyConfirmed') : t('promoteToTitle', { status: tStatus(promoteOne(section.canonStatus)) })}
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                onClick={handleDemote}
                disabled={section.canonStatus === 'draft'}
                className="p-1 rounded text-sepia-600 hover:text-sepia-700 hover:bg-sepia-300/30 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-sepia-600"
                aria-label={t('demoteAria')}
                title={section.canonStatus === 'draft' ? t('alreadyDraft') : t('demoteToTitle', { status: tStatus(demoteOne(section.canonStatus)) })}
              >
                <ChevronDown size={14} />
              </button>
              <button
                type="button"
                onClick={handleDiscard}
                className="p-1 rounded text-sepia-600 hover:text-wax-600 hover:bg-wax-500/10"
                aria-label={t('discardAria')}
                title={t('markDiscarded')}
              >
                <Archive size={14} />
              </button>
            </div>
          )}
        </div>
        <span className="text-[10px] text-sepia-600">
          {new Date(section.lastUpdated).toLocaleDateString()}
        </span>
      </div>
    </ParchmentCard>
  );
}
