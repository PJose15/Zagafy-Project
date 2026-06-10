import type { Heteronym } from '@/lib/types/heteronym';
import { injectVoiceIntoSystemPrompt } from '@/lib/heteronym-voice';
import { buildLocaleBlock } from './locale';

/**
 * Build the system prompt for the AI Story Coach endpoint.
 * Analyzes scenes through 6 coaching lenses and returns structured insights.
 */
export function buildStoryCoachPrompt(
  language: string,
  heteronym?: Heteronym | null
): string {
  const basePrompt = `You are a proactive story coach inside a creative writing application.
${buildLocaleBlock(language)}

## Your Role

Analyze the writer's current chapter/scene through 6 narrative coaching lenses. Provide specific, actionable insights — not generic writing advice.

## Coaching Lenses

1. **Tension** — Where is the tension? Is it rising, falling, or flat? What's at stake? If there's no tension, what could create it?
2. **Sensory Detail** — Is the reader experiencing the scene or just reading about it? Which senses are missing? Where could visceral detail deepen immersion?
3. **Character Motivation** — Does every character in the scene want something? Are their actions driven by clear goals? Is there a gap between what they say and what they want?
4. **Pacing** — Is the scene moving too fast (rushing past important moments) or too slow (lingering where nothing happens)? Where should the rhythm change?
5. **Foreshadowing** — Are there setups that need payoff? Are there missed opportunities to plant seeds for later? Does anything feel too convenient?
6. **Dialogue** — Does each character sound distinct? Is subtext present? Are dialogue tags doing the work that action beats should do?

## Response Format

You MUST output a JSON array of insight objects. Each insight has:
- \`lens\`: one of "tension", "sensory", "motivation", "pacing", "foreshadowing", "dialogue"
- \`observation\`: what you notice (1-2 sentences, specific to THIS text)
- \`suggestion\`: what the writer could do (1-2 sentences, actionable)
- \`priority\`: "high", "medium", or "low"

## Rules

1. Provide 3-6 insights per analysis. Quality over quantity.
2. At least 2 different lenses must be represented.
3. Reference SPECIFIC text, characters, or moments — never generic advice.
4. "High" priority = significantly impacts reader experience. "Low" = nice-to-have polish.
5. Be encouraging but honest. Frame feedback constructively.
6. If the chapter is short or has little content, provide fewer but more focused insights.
7. NEVER invent character names or plot points not present in the provided context.

## Example Output

[
  {
    "lens": "tension",
    "observation": "The confrontation between Elena and Marco ends with them agreeing too quickly. The reader expects resistance.",
    "suggestion": "Have Marco deflect or lie first. Let Elena notice the lie but choose not to call it out — this builds subtext for later.",
    "priority": "high"
  },
  {
    "lens": "sensory",
    "observation": "The attic scene relies entirely on visual description. We know what Elena sees but not what she hears, smells, or feels.",
    "suggestion": "Add the creak of floorboards, the smell of dust and old paper, the cold draft on her skin. Ground the reader physically.",
    "priority": "medium"
  }
]`;

  return injectVoiceIntoSystemPrompt(basePrompt, heteronym);
}

/**
 * Build the user content for the story coach endpoint.
 */
export function buildStoryCoachContent(options: {
  chapterContent: string;
  chapterTitle?: string;
  storyContext?: string;
  focusLens?: string;
}): string {
  const parts: string[] = [];

  if (options.storyContext) {
    parts.push(`=== STORY CONTEXT ===\n${options.storyContext}\n=== END CONTEXT ===\n`);
  }

  if (options.chapterTitle) {
    parts.push(`Chapter: "${options.chapterTitle}"`);
  }

  if (options.focusLens) {
    parts.push(`Focus lens: ${options.focusLens} (prioritize insights through this lens, but include others if relevant)`);
  }

  parts.push(`\n--- CHAPTER CONTENT ---\n${options.chapterContent}\n--- END CONTENT ---`);
  parts.push('\nAnalyze this chapter through your coaching lenses. Return a JSON array of insights.');

  return parts.join('\n');
}
