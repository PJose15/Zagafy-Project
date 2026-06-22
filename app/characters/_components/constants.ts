import { ShieldCheck, Shield, ShieldAlert, ShieldOff } from 'lucide-react';
import type { CharacterState } from '@/lib/store';

export const defaultCurrentState: CharacterState = {
  emotionalState: '',
  visibleGoal: '',
  hiddenNeed: '',
  currentFear: '',
  dominantBelief: '',
  emotionalWound: '',
  pressureLevel: 'Low',
  currentKnowledge: '',
  indicator: 'stable',
};

// Status labels live in the shared `canonStatus` i18n namespace, keyed by these
// same keys (confirmed/flexible/draft/discarded).
export const statusConfig = {
  confirmed: { icon: ShieldCheck, color: 'text-forest-400', bg: 'bg-forest-400/10' },
  flexible: { icon: Shield, color: 'text-brass-400', bg: 'bg-brass-400/10' },
  draft: { icon: ShieldAlert, color: 'text-brass-500', bg: 'bg-brass-500/10' },
  discarded: { icon: ShieldOff, color: 'text-wax-500', bg: 'bg-wax-500/10' },
};

export const indicatorConfig = {
  'stable': { color: 'text-forest-400', bg: 'bg-forest-400/10' },
  'shifting': { color: 'text-sepia-400', bg: 'bg-sepia-400/10' },
  'under pressure': { color: 'text-brass-500', bg: 'bg-brass-500/10' },
  'emotionally conflicted': { color: 'text-wax-600', bg: 'bg-wax-600/10' },
  'at risk of contradiction': { color: 'text-wax-500', bg: 'bg-wax-500/10' },
};
