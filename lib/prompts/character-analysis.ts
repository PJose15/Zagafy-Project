import { buildLocaleBlock } from './locale';

interface CharacterAnalysisParams {
  language: string;
  name: string;
  role: string;
  coreIdentity: string;
  currentState?: {
    emotionalState?: string;
    visibleGoal?: string;
    hiddenNeed?: string;
    currentFear?: string;
    dominantBelief?: string;
    emotionalWound?: string;
    pressureLevel?: string;
    currentKnowledge?: string;
  };
  stateHistory: Array<{ context: string; changes: string }>;
  relationships: Array<{
    targetName: string;
    trustLevel: number;
    tensionLevel: number;
    dynamics: string;
  }>;
}

export function buildCharacterAnalysisSystemPrompt(language: string): string {
  return `${buildLocaleBlock(language)}

You are an expert narrative editor and character psychologist.
Analyze the following character's current state and provide a "Character Intelligence Audit".

Provide your analysis in the following format (use Markdown):
### Character State Snapshot
(Brief summary of their current mental/emotional position)

### Current Emotional Logic
(How their goals, fears, and needs are interacting right now)

### What They Likely Want Right Now
(Immediate desires based on state)

### What They Are Likely to Avoid
(Immediate aversions based on state)

### Risks of Out-of-Character Behavior
(What would be OOC for them right now? What should the writer avoid doing with them?)

### Recommended Behavioral Direction
(How should they act in the next scene?)`;
}

export function buildCharacterAnalysisPrompt(params: CharacterAnalysisParams): string {
  const historyLines = params.stateHistory
    .map(h => `- ${h.context || 'Unknown'}: ${h.changes || 'Unknown'}`)
    .join('\n');

  const relationshipLines = params.relationships
    .map(r => `- With ${r.targetName || 'Unknown'}: Trust ${r.trustLevel}%, Tension ${r.tensionLevel}%. Dynamics: ${r.dynamics}`)
    .join('\n');

  return `<character_data>
Character Name: ${params.name}
Role: ${params.role}
Core Identity (Permanent): ${params.coreIdentity}

Current Live State:
- Emotional State: ${params.currentState?.emotionalState || 'Unknown'}
- Visible Goal: ${params.currentState?.visibleGoal || 'Unknown'}
- Hidden Need: ${params.currentState?.hiddenNeed || 'Unknown'}
- Current Fear: ${params.currentState?.currentFear || 'Unknown'}
- Dominant Belief: ${params.currentState?.dominantBelief || 'Unknown'}
- Emotional Wound: ${params.currentState?.emotionalWound || 'Unknown'}
- Pressure Level: ${params.currentState?.pressureLevel || 'Unknown'}
- What they know right now: ${params.currentState?.currentKnowledge || 'Unknown'}

Recent History:
${historyLines || 'No history recorded.'}

Relationships:
${relationshipLines || 'No relationships recorded.'}
</character_data>`;
}
