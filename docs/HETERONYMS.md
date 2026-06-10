# Heteronyms

> The heteronym system lets writers adopt different creative voices, each
> with its own tone, vocabulary, and pacing profile. When active, the
> heteronym's voice is injected into every AI prompt so the assistant
> responds in the chosen style.

## What is a heteronym?

In literary tradition, a heteronym is a fictional author persona with a
distinct writing style (coined by Fernando Pessoa). In Zagafy, heteronyms
let you switch between writing voices — e.g., one for gritty crime fiction
and another for lyrical fantasy.

## How it works

### Data model

Each heteronym has:
- **Name** — display name (e.g., "Dark Voice", "Lyric Mode")
- **Bio** — description of the persona
- **Style Note** — additional style guidance
- **Voice Profile** (optional):
  - **Tone** — formal, casual, poetic, raw, clinical, playful
  - **Vocabulary** — simple, literary, technical, archaic, slang, mixed
  - **Pacing** — staccato, flowing, measured, breathless, languid
  - **Freeform Note** — any additional voice guidance

### Storage

Heteronyms are stored in `localStorage` under `zagafy_heteronyms` (JSON
array). The active heteronym ID is stored under `zagafy_active_heteronym`.
Maximum 10 heteronyms per project.

### Prompt injection

When a heteronym is active, the function `injectVoiceIntoSystemPrompt()`
in `lib/heteronym-voice.ts` appends an `## Active Writing Voice` section
to every AI system prompt:

```
## Active Writing Voice

Writing as "Dark Voice":
- Tone: Raw & unfiltered
- Vocabulary: Simple & direct
- Pacing: Staccato — short, punchy
- Additional: Use sentence fragments. Avoid adjectives. Let verbs carry the weight.
```

This affects all AI endpoints: chat, story-coach, character-chat,
micro-prompt, polish, and character analysis.

## Managing heteronyms

### In the UI

Navigate to **Settings → Heteronym Settings** to:
- Create new heteronyms (up to 10)
- Edit name, bio, style note, and voice profile
- Set the active heteronym
- Delete heteronyms (except the default)

### Programmatically

```typescript
import {
  readHeteronyms,
  addHeteronym,
  updateHeteronym,
  deleteHeteronym,
  getActiveHeteronymId,
  setActiveHeteronymId,
} from '@/lib/types/heteronym';

import {
  buildVoiceDirective,
  injectVoiceIntoSystemPrompt,
} from '@/lib/heteronym-voice';
```

## Adding a new heteronym

1. Go to Settings → Heteronym Settings
2. Click "Add Heteronym"
3. Fill in name and optional bio/style note
4. Configure the voice profile (tone, vocabulary, pacing)
5. Click "Save"
6. Set it as active to use it

## Canon interaction

Heteronyms affect **how** the AI writes, not **what** it writes about.
Canon rules always take precedence:

- Confirmed canon facts cannot be contradicted, regardless of voice
- The heteronym's tone/vocabulary shapes the AI's suggestions and prose
- Character behavior stays consistent with established personality data
- The voice profile is additive — it layers on top of the base system prompt

## Default heteronym

Every project starts with a default heteronym named after the user (or
"Myself" if no display name is available). The default heteronym cannot
be deleted but can be edited.
