'use client';

import { useTranslations } from 'next-intl';
import type { Character, CharacterState } from '@/lib/store';
import { defaultCurrentState } from './constants';

interface StateTabProps {
  editForm: Partial<Character>;
  setEditForm: (form: Partial<Character>) => void;
}

export function StateTab({ editForm, setEditForm }: StateTabProps) {
  const t = useTranslations('characters');
  const current = editForm.currentState || defaultCurrentState;

  const updateState = (patch: Partial<CharacterState>) => {
    setEditForm({ ...editForm, currentState: { ...current, ...patch } });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center justify-between bg-parchment-200 p-4 rounded-xl border border-sepia-300/50">
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider mb-1">{t('stateIndicatorLabel')}</label>
            <select
              value={current.indicator || 'stable'}
              onChange={(e) => updateState({ indicator: e.target.value as CharacterState['indicator'] })}
              className="bg-parchment-100 border border-sepia-300/50 rounded-lg px-3 py-1.5 text-sm text-sepia-700 focus:outline-none focus:ring-2 focus:ring-brass-400/40"
            >
              <option value="stable">{t('indicator.stable')}</option>
              <option value="shifting">{t('indicator.shifting')}</option>
              <option value="under pressure">{t('indicator.under pressure')}</option>
              <option value="emotionally conflicted">{t('indicator.emotionally conflicted')}</option>
              <option value="at risk of contradiction">{t('indicator.at risk of contradiction')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider mb-1">{t('pressureLabel')}</label>
            <select
              value={current.pressureLevel || 'Low'}
              onChange={(e) => updateState({ pressureLevel: e.target.value as CharacterState['pressureLevel'] })}
              className="bg-parchment-100 border border-sepia-300/50 rounded-lg px-3 py-1.5 text-sm text-sepia-700 focus:outline-none focus:ring-2 focus:ring-brass-400/40"
            >
              <option value="Low">{t('pressure.Low')}</option>
              <option value="Medium">{t('pressure.Medium')}</option>
              <option value="High">{t('pressure.High')}</option>
              <option value="Critical">{t('pressure.Critical')}</option>
            </select>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs text-sepia-600 uppercase tracking-wider block mb-1">{t('currentKnowledgeLabel')}</span>
          <input
            type="text"
            value={current.currentKnowledge || ''}
            onChange={(e) => updateState({ currentKnowledge: e.target.value })}
            className="bg-parchment-100 border border-sepia-300/50 rounded-lg px-3 py-1.5 text-sm text-sepia-700 focus:outline-none focus:ring-2 focus:ring-brass-400/40 w-64"
            placeholder={t('currentKnowledgePlaceholder')}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider mb-2">{t('emotionalStateLabel')}</label>
          <textarea
            value={current.emotionalState || ''}
            onChange={(e) => updateState({ emotionalState: e.target.value })}
            className="w-full h-20 bg-parchment-200 border border-sepia-300/50 rounded-lg px-4 py-3 text-sm text-sepia-700 font-sans resize-y focus:outline-none focus:ring-2 focus:ring-brass-400/40"
            placeholder={t('emotionalStatePlaceholder')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider mb-2">{t('visibleGoalLabel')}</label>
          <textarea
            value={current.visibleGoal || ''}
            onChange={(e) => updateState({ visibleGoal: e.target.value })}
            className="w-full h-20 bg-parchment-200 border border-sepia-300/50 rounded-lg px-4 py-3 text-sm text-sepia-700 font-sans resize-y focus:outline-none focus:ring-2 focus:ring-brass-400/40"
            placeholder={t('visibleGoalPlaceholder')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider mb-2">{t('hiddenNeedLabel')}</label>
          <textarea
            value={current.hiddenNeed || ''}
            onChange={(e) => updateState({ hiddenNeed: e.target.value })}
            className="w-full h-20 bg-parchment-200 border border-sepia-300/50 rounded-lg px-4 py-3 text-sm text-sepia-700 font-sans resize-y focus:outline-none focus:ring-2 focus:ring-brass-400/40"
            placeholder={t('hiddenNeedPlaceholder')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider mb-2">{t('currentFearLabel')}</label>
          <textarea
            value={current.currentFear || ''}
            onChange={(e) => updateState({ currentFear: e.target.value })}
            className="w-full h-20 bg-parchment-200 border border-sepia-300/50 rounded-lg px-4 py-3 text-sm text-sepia-700 font-sans resize-y focus:outline-none focus:ring-2 focus:ring-brass-400/40"
            placeholder={t('currentFearPlaceholder')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider mb-2">{t('dominantBeliefLabel')}</label>
          <textarea
            value={current.dominantBelief || ''}
            onChange={(e) => updateState({ dominantBelief: e.target.value })}
            className="w-full h-20 bg-parchment-200 border border-sepia-300/50 rounded-lg px-4 py-3 text-sm text-sepia-700 font-sans resize-y focus:outline-none focus:ring-2 focus:ring-brass-400/40"
            placeholder={t('dominantBeliefPlaceholder')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider mb-2">{t('emotionalWoundLabel')}</label>
          <textarea
            value={current.emotionalWound || ''}
            onChange={(e) => updateState({ emotionalWound: e.target.value })}
            className="w-full h-20 bg-parchment-200 border border-sepia-300/50 rounded-lg px-4 py-3 text-sm text-sepia-700 font-sans resize-y focus:outline-none focus:ring-2 focus:ring-brass-400/40"
            placeholder={t('emotionalWoundPlaceholder')}
          />
        </div>
      </div>
    </div>
  );
}
