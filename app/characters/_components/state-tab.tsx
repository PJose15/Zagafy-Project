'use client';

import type { Character, CharacterState } from '@/lib/store';
import { defaultCurrentState } from './constants';

interface StateTabProps {
  editForm: Partial<Character>;
  setEditForm: (form: Partial<Character>) => void;
}

export function StateTab({ editForm, setEditForm }: StateTabProps) {
  const current = editForm.currentState || defaultCurrentState;

  const updateState = (patch: Partial<CharacterState>) => {
    setEditForm({ ...editForm, currentState: { ...current, ...patch } });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center justify-between bg-parchment-200 p-4 rounded-xl border border-sepia-300/50">
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider mb-1">State Indicator</label>
            <select
              value={current.indicator || 'stable'}
              onChange={(e) => updateState({ indicator: e.target.value as CharacterState['indicator'] })}
              className="bg-parchment-100 border border-sepia-300/50 rounded-lg px-3 py-1.5 text-sm text-sepia-700 focus:outline-none focus:ring-2 focus:ring-brass-400/40"
            >
              <option value="stable">Stable</option>
              <option value="shifting">Shifting</option>
              <option value="under pressure">Under Pressure</option>
              <option value="emotionally conflicted">Emotionally Conflicted</option>
              <option value="at risk of contradiction">At Risk of Contradiction</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider mb-1">Pressure Level</label>
            <select
              value={current.pressureLevel || 'Low'}
              onChange={(e) => updateState({ pressureLevel: e.target.value as CharacterState['pressureLevel'] })}
              className="bg-parchment-100 border border-sepia-300/50 rounded-lg px-3 py-1.5 text-sm text-sepia-700 focus:outline-none focus:ring-2 focus:ring-brass-400/40"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs text-sepia-600 uppercase tracking-wider block mb-1">Current Knowledge</span>
          <input
            type="text"
            value={current.currentKnowledge || ''}
            onChange={(e) => updateState({ currentKnowledge: e.target.value })}
            className="bg-parchment-100 border border-sepia-300/50 rounded-lg px-3 py-1.5 text-sm text-sepia-700 focus:outline-none focus:ring-2 focus:ring-brass-400/40 w-64"
            placeholder="What do they know right now?"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider mb-2">Current Emotional State</label>
          <textarea
            value={current.emotionalState || ''}
            onChange={(e) => updateState({ emotionalState: e.target.value })}
            className="w-full h-20 bg-parchment-200 border border-sepia-300/50 rounded-lg px-4 py-3 text-sm text-sepia-700 font-sans resize-y focus:outline-none focus:ring-2 focus:ring-brass-400/40"
            placeholder="How are they feeling in this exact moment?"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider mb-2">Visible Goal</label>
          <textarea
            value={current.visibleGoal || ''}
            onChange={(e) => updateState({ visibleGoal: e.target.value })}
            className="w-full h-20 bg-parchment-200 border border-sepia-300/50 rounded-lg px-4 py-3 text-sm text-sepia-700 font-sans resize-y focus:outline-none focus:ring-2 focus:ring-brass-400/40"
            placeholder="What are they actively trying to achieve?"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider mb-2">Hidden Need</label>
          <textarea
            value={current.hiddenNeed || ''}
            onChange={(e) => updateState({ hiddenNeed: e.target.value })}
            className="w-full h-20 bg-parchment-200 border border-sepia-300/50 rounded-lg px-4 py-3 text-sm text-sepia-700 font-sans resize-y focus:outline-none focus:ring-2 focus:ring-brass-400/40"
            placeholder="What do they actually need (but might not know)?"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider mb-2">Current Fear</label>
          <textarea
            value={current.currentFear || ''}
            onChange={(e) => updateState({ currentFear: e.target.value })}
            className="w-full h-20 bg-parchment-200 border border-sepia-300/50 rounded-lg px-4 py-3 text-sm text-sepia-700 font-sans resize-y focus:outline-none focus:ring-2 focus:ring-brass-400/40"
            placeholder="What are they most afraid of right now?"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider mb-2">Dominant Belief</label>
          <textarea
            value={current.dominantBelief || ''}
            onChange={(e) => updateState({ dominantBelief: e.target.value })}
            className="w-full h-20 bg-parchment-200 border border-sepia-300/50 rounded-lg px-4 py-3 text-sm text-sepia-700 font-sans resize-y focus:outline-none focus:ring-2 focus:ring-brass-400/40"
            placeholder="What belief is driving their current actions?"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-sepia-600 uppercase tracking-wider mb-2">Emotional Wound</label>
          <textarea
            value={current.emotionalWound || ''}
            onChange={(e) => updateState({ emotionalWound: e.target.value })}
            className="w-full h-20 bg-parchment-200 border border-sepia-300/50 rounded-lg px-4 py-3 text-sm text-sepia-700 font-sans resize-y focus:outline-none focus:ring-2 focus:ring-brass-400/40"
            placeholder="What past hurt is influencing them?"
          />
        </div>
      </div>
    </div>
  );
}
