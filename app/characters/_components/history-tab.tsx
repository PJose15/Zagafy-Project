'use client';

import { useTranslations } from 'next-intl';
import { Activity, X } from 'lucide-react';
import type { Character, CharacterStateHistory } from '@/lib/store';

interface HistoryTabProps {
  editForm: Partial<Character>;
  setEditForm: (form: Partial<Character>) => void;
}

export function HistoryTab({ editForm, setEditForm }: HistoryTabProps) {
  const t = useTranslations('characters');
  const history = editForm.stateHistory || [];

  const updateHistory = (newHist: CharacterStateHistory[]) => {
    setEditForm({ ...editForm, stateHistory: newHist });
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center justify-between mb-4">
        <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider">{t('timelineLabel')}</label>
        <button
          onClick={() => {
            const newEvent: CharacterStateHistory = {
              id: crypto.randomUUID(),
              date: new Date().toISOString().split('T')[0],
              context: '',
              changes: '',
            };
            updateHistory([newEvent, ...history]);
          }}
          className="text-xs bg-parchment-200 hover:bg-parchment-300 text-sepia-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          {t('logChange')}
        </button>
      </div>

      <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-sepia-300/50 before:to-transparent">
        {history.map((h, idx) => (
          <div key={h.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-sepia-300/50 bg-parchment-100 text-sepia-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
              <Activity size={16} aria-hidden="true" />
            </div>
            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-parchment-200 p-4 rounded-xl border border-sepia-300/50 shadow">
              <div className="flex items-center justify-between mb-2">
                <input
                  type="text"
                  value={h.context}
                  onChange={(e) => {
                    updateHistory(history.map((item, i) => (i === idx ? { ...item, context: e.target.value } : item)));
                  }}
                  className="bg-transparent border-b border-sepia-300/50 px-1 py-0.5 text-sm font-medium text-sepia-800 focus:outline-none focus:border-brass-500/60"
                  placeholder={t('contextPlaceholder')}
                />
                <button
                  onClick={() => {
                    const newHist = [...history];
                    newHist.splice(idx, 1);
                    updateHistory(newHist);
                  }}
                  className="text-sepia-600 hover:text-wax-500"
                  aria-label={t('removeEntry')}
                >
                  <X size={14} />
                </button>
              </div>
              <textarea
                value={h.changes}
                onChange={(e) => {
                  updateHistory(history.map((item, i) => (i === idx ? { ...item, changes: e.target.value } : item)));
                }}
                className="w-full bg-parchment-100 border border-sepia-300/50 rounded-lg px-3 py-2 text-sm text-sepia-600 font-sans resize-y focus:outline-none focus:ring-2 focus:ring-brass-400/40"
                placeholder={t('changesPlaceholder')}
              />
            </div>
          </div>
        ))}
        {history.length === 0 && (
          <div className="text-center py-6 text-sm text-sepia-600">
            {t('noHistory')}
          </div>
        )}
      </div>
    </div>
  );
}
