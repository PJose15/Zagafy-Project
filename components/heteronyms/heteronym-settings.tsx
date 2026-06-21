'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { AvatarCircle } from './avatar-circle';
import { HeteronymModal } from './heteronym-modal';
import {
  readHeteronyms,
  addHeteronym,
  updateHeteronym,
  deleteHeteronym,
  isAtLimit,
  getActiveHeteronymId,
  setActiveHeteronymId,
  getDefaultHeteronym,
} from '@/lib/types/heteronym';
import type { Heteronym } from '@/lib/types/heteronym';
import type { HeteronymVoice } from '@/lib/heteronym-voice';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm-dialog';

export function HeteronymSettings() {
  const t = useTranslations('heteronyms');
  const [heteronyms, setHeteronyms] = useState<Heteronym[]>(() => readHeteronyms());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHeteronym, setEditingHeteronym] = useState<Heteronym | null>(null);
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const refresh = useCallback(() => {
    setHeteronyms(readHeteronyms());
  }, []);

  const handleCreate = () => {
    if (isAtLimit()) {
      toast(t('maxReached'), 'error');
      return;
    }
    setEditingHeteronym(null);
    setModalOpen(true);
  };

  const handleEdit = (h: Heteronym) => {
    setEditingHeteronym(h);
    setModalOpen(true);
  };

  const handleDelete = async (h: Heteronym) => {
    if (h.isDefault) return;

    const confirmed = await confirm({
      title: t('deleteTitle', { name: h.name }),
      message: t('deleteMessage'),
      confirmLabel: t('deleteLabel'),
      variant: 'danger',
    });

    if (!confirmed) return;

    deleteHeteronym(h.id);
    refresh();
    toast(t('deleted', { name: h.name }), 'success');
  };

  const handleSave = (data: { name: string; bio: string; styleNote: string; avatarColor: string; avatarEmoji: string; voice?: HeteronymVoice }) => {
    if (editingHeteronym) {
      updateHeteronym(editingHeteronym.id, data);
      toast(t('updated', { name: data.name }), 'success');
    } else {
      const { voice, ...restData } = data;
      const newH: Heteronym = {
        id: crypto.randomUUID(),
        ...restData,
        voice,
        createdAt: new Date().toISOString(),
        isDefault: false,
      };
      const added = addHeteronym(newH);
      if (!added) {
        toast(t('maxReached'), 'error');
        setModalOpen(false);
        return;
      }
      // Auto-activate first non-default heteronym if no active set
      if (!getActiveHeteronymId()) {
        const def = getDefaultHeteronym();
        if (def) setActiveHeteronymId(def.id);
      }
      toast(t('created', { name: data.name }), 'success');
    }
    setModalOpen(false);
    refresh();
  };

  const activeId = getActiveHeteronymId();

  return (
    <section className="bg-parchment-100 border border-sepia-300/50 rounded-xl p-6 space-y-4 texture-parchment shadow-parchment" aria-label={t('settingsAria')}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-serif font-semibold text-sepia-900 flex items-center gap-2">
          <Users size={20} className="text-brass-500" />
          {t('heading')}
        </h2>
        <button
          onClick={handleCreate}
          disabled={isAtLimit()}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-forest-700 text-cream-50 hover:bg-forest-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={16} />
          {t('new')}
        </button>
      </div>

      <p className="text-sepia-600 text-sm leading-relaxed">
        {t.rich('explainer', { b: (chunks) => <strong>{chunks}</strong> })}
      </p>

      {heteronyms.length === 0 ? (
        <p className="text-sepia-600 text-sm italic py-4 text-center">{t('empty')}</p>
      ) : (
        <div className="space-y-2" role="list" aria-label={t('listAria')}>
          {heteronyms.map((h) => (
            <div
              key={h.id}
              role="listitem"
              className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                activeId === h.id
                  ? 'border-brass-500/50 bg-forest-600/5'
                  : 'border-sepia-300/50 hover:border-sepia-300/40'
              }`}
            >
              <AvatarCircle color={h.avatarColor} emoji={h.avatarEmoji} size={40} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sepia-900 font-medium text-sm truncate">{h.name}</p>
                  {h.isDefault && (
                    <span className="text-[10px] uppercase tracking-wider text-sepia-600 bg-parchment-200 px-1.5 py-0.5 rounded">
                      {t('default')}
                    </span>
                  )}
                  {activeId === h.id && (
                    <span className="text-[10px] uppercase tracking-wider text-brass-500 bg-forest-500/10 px-1.5 py-0.5 rounded">
                      {t('active')}
                    </span>
                  )}
                </div>
                {h.styleNote && (
                  <p className="text-xs text-sepia-600 truncate mt-0.5">{h.styleNote}</p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleEdit(h)}
                  className="p-1.5 rounded-lg text-sepia-600 hover:text-sepia-800 hover:bg-parchment-200 transition-colors"
                  aria-label={t('editAria', { name: h.name })}
                >
                  <Pencil size={14} />
                </button>
                {!h.isDefault && (
                  <button
                    onClick={() => handleDelete(h)}
                    className="p-1.5 rounded-lg text-sepia-600 hover:text-wax-500 hover:bg-parchment-200 transition-colors"
                    aria-label={t('deleteAria', { name: h.name })}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-sepia-600 pt-2">{t('count', { count: heteronyms.length })}</p>

      {modalOpen && (
        <HeteronymModal
          heteronym={editingHeteronym}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      )}
    </section>
  );
}
