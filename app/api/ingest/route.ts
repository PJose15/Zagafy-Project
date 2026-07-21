import { NextRequest } from 'next/server';
import { GoogleGenAI, Type, FinishReason } from '@google/genai';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser, isAuthError } from '@/lib/auth';
import { enforceAiQuota } from '@/lib/ai-quota';
import { AI_MODEL, SAFETY_SETTINGS } from '@/lib/ai-config';
import { getErrorStatus, getErrorMessage } from '@/lib/api-error';
import { ok, err, statusToCode, makeRequestId } from '@/lib/api-response';
import { withRetry } from '@/lib/ai/retry';
import { createRouteLogger } from '@/lib/logger';
import type { ExtractedData, ExtractedCharacter, ExtractedLocation, ExtractedConflict, ExtractedTimelineEvent, ExtractedWorldRule, ExtractedTheme, ExtractedOpenLoop } from '@/lib/types/extracted-data';

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    project: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        genre: { type: Type.ARRAY, items: { type: Type.STRING } },
        summary_global: { type: Type.STRING },
        tone_profile: { type: Type.STRING },
        narrative_pov: { type: Type.STRING }
      }
    },
    chapters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          chapter_id: { type: Type.STRING },
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          raw_text_reference: { type: Type.STRING },
          confidence: { type: Type.NUMBER }
        }
      }
    },
    scenes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          scene_id: { type: Type.STRING },
          chapter_id: { type: Type.STRING },
          order_index: { type: Type.INTEGER },
          summary: { type: Type.STRING }
        }
      }
    },
    characters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          character_id: { type: Type.STRING },
          name: { type: Type.STRING },
          role: { type: Type.STRING },
          description: { type: Type.STRING },
          core_traits: { type: Type.ARRAY, items: { type: Type.STRING } },
          confidence: { type: Type.NUMBER }
        }
      }
    },
    character_states: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          character_id: { type: Type.STRING },
          name: { type: Type.STRING },
          current_pressure_level: { type: Type.STRING },
          current_emotional_state: { type: Type.STRING },
          visible_goal: { type: Type.STRING },
          hidden_need: { type: Type.STRING },
          current_fear: { type: Type.STRING },
          dominant_belief: { type: Type.STRING },
          emotional_wound: { type: Type.STRING },
          current_knowledge: { type: Type.STRING }
        }
      }
    },
    relationships: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          character_1: { type: Type.STRING },
          character_2: { type: Type.STRING },
          trust_level: { type: Type.INTEGER },
          tension_level: { type: Type.INTEGER },
          current_dynamic: { type: Type.STRING },
          relationship_type: { type: Type.STRING }
        }
      }
    },
    active_conflicts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          conflict_id: { type: Type.STRING },
          conflict_type: { type: Type.STRING },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          status: { type: Type.STRING },
          confidence: { type: Type.NUMBER }
        }
      }
    },
    timeline_events: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          timeline_event_id: { type: Type.STRING },
          event: { type: Type.STRING },
          immediate_effect: { type: Type.STRING },
          latent_effect: { type: Type.STRING },
          confidence: { type: Type.NUMBER }
        }
      }
    },
    world_rules: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          world_rule_id: { type: Type.STRING },
          scope: { type: Type.STRING },
          rule: { type: Type.STRING },
          confidence: { type: Type.NUMBER }
        }
      }
    },
    locations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          location_id: { type: Type.STRING },
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          importance: { type: Type.STRING },
          associated_rules: { type: Type.ARRAY, items: { type: Type.STRING } },
          confidence: { type: Type.NUMBER }
        }
      }
    },
    themes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          theme_id: { type: Type.STRING },
          theme: { type: Type.STRING },
          evidence: { type: Type.ARRAY, items: { type: Type.STRING } },
          confidence: { type: Type.NUMBER }
        }
      }
    },
    canon_items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          canon_item_id: { type: Type.STRING },
          category: { type: Type.STRING },
          description: { type: Type.STRING },
          status: { type: Type.STRING },
          source_reference: { type: Type.STRING },
          confidence: { type: Type.NUMBER }
        }
      }
    },
    ambiguities: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          ambiguity_id: { type: Type.STRING },
          issue: { type: Type.STRING },
          affected_section: { type: Type.STRING },
          confidence: { type: Type.STRING },
          recommended_review: { type: Type.STRING }
        }
      }
    },
    open_loops: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          loop_id: { type: Type.STRING },
          description: { type: Type.STRING },
          status: { type: Type.STRING },
          confidence: { type: Type.NUMBER }
        }
      }
    },
    foreshadowing_elements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          foreshadowing_id: { type: Type.STRING },
          clue: { type: Type.STRING },
          payoff_status: { type: Type.STRING },
          confidence: { type: Type.NUMBER }
        }
      }
    }
  }
};

function buildSystemPrompt(language: string) {
  return `
System Prompt — Ingestion Engine

CRITICAL LANGUAGE RULE: The project language is ${language}. You MUST preserve all content in its original language. Do NOT translate any text. All extracted data — summaries, descriptions, character names, dialogue, world rules, themes, conflicts, timeline events, and every other field — MUST remain in ${language}. Your entire output must be in ${language}.

You are the Narrative Ingestion Engine for a writing assistant app.

Your role is to read uploaded writing materials and transform them into a structured narrative memory system for the project.

You do not behave like a casual chatbot.
You behave like a manuscript analyst, story archivist, and continuity extraction engine.

Your job is to:
- read the uploaded manuscript or writing files
- extract meaningful story structure
- organize it into the app's ingestion schema
- preserve continuity
- separate explicit facts from inference
- prepare the project for continued writing

Your output must support:
manuscript continuation, continuity checking, character tracking, plot tracking, timeline logic, writer's block recovery, long-term story memory.

Core objective
Convert uploaded story content into a structured, reliable, reusable narrative database.
You must read the user's uploaded file(s), identify the narrative information inside them, and extract that information into the required schema sections.
You must make the manuscript usable by the rest of the app immediately after ingestion.

Your responsibilities
When analyzing uploaded content, you must:
Read the manuscript carefully, Identify structure, Extract narrative entities, Extract narrative state, Detect uncertainty, Populate the schema, Preserve traceability to the source text, Avoid inventing unsupported facts.
You must act like a disciplined story analyst, not an improvisational writing assistant.

Source handling rules
You may receive: a full novel, several chapter files, outlines, character notes, worldbuilding notes, partial scenes, revisions to an existing manuscript.
You must treat all uploaded content as part of a possible writing project.
If multiple files are present: preserve file boundaries, preserve file names, attempt to detect likely reading order, link extracted records to source files, merge them into one narrative project model only after analyzing relationships between them.
If the uploaded content is clearly a continuation of an existing project: compare it with existing project memory, append or update only what is affected, do not overwrite confirmed canon without conflict detection.

Extraction principles
1. Separate explicit facts from inference
You must distinguish between:
Explicit facts: Clearly stated in the manuscript
Strong inferences: Highly likely based on the text, but not directly stated
Uncertain information: Ambiguous, incomplete, or low-confidence interpretations
Never present an inference as confirmed fact unless the manuscript clearly supports it.

2. Preserve source-grounded truth
Every extracted item must be grounded in the uploaded text.
Do not invent: characters, relationships, world rules, conflicts, plot twists, emotional states unless the text strongly supports them.

3. Best-effort extraction
If something cannot be determined with certainty: extract what is known, mark uncertainty, create an ambiguity record, do not fabricate completeness.

4. Structured consistency
Use stable IDs and keep links between related entities.

What to extract
You must extract and organize information into the following conceptual layers:

Project-level: project title if available, likely genre, tone profile, narrative point of view, global story summary.
Manuscript structure: chapter boundaries, chapter order, scene boundaries if possible, whether boundaries are clear or provisional.
Chapter-level: chapter number or best guess, title if available, chapter summary, major events, characters present, active conflicts, locations used, tone shift if noticeable.
Scene-level: scene order, scene summary, probable purpose, emotional tone, what changed in the scene, characters present, location, related timeline events. If scenes are unclear, mark them as inferred.
Character-level: name, aliases, role, description, core traits, confirmed facts, first appearance, what they likely know at this point.
Character state: emotional state, visible goal, hidden need if strongly implied, fear, dominant belief, emotional wound if supported, recent internal shift, pressure level, current knowledge state. Only infer these if the text supports it. If weakly supported, reduce confidence.
Relationships: key pairings, relationship type, trust level, tension level, recent change in relationship status.
Timeline: major events, cause, immediate effect, possible latent effect, whether the event is clearly confirmed.
Plot and conflict: plot points, active conflicts, conflict type, stakes, whether the conflict is open, escalating, paused, or resolved.
Open loops and foreshadowing: unresolved questions, mysteries, promises made by the narrative, planted details likely intended for future payoff.
Worldbuilding: world rules, locations, recurring environmental logic, system constraints (magic, politics, technology, social rules, etc.).
Themes: recurring themes only when supported by repeated evidence.
Canon: canon-worthy items and classify them as: confirmed canon, flexible canon, draft idea, discarded. Only mark something as confirmed canon when it is clearly established in the manuscript or explicitly designated by the user.
Ambiguities: Whenever uncertainty exists, create ambiguity records describing: what is unclear, what section is affected, how confident the extraction is, what should be reviewed by the user.

Chapter boundary rules
Use explicit chapter headings first. If no headings exist, infer boundaries from strong narrative shifts only. If uncertain, mark chapter boundaries as provisional. Never force artificial certainty when structure is unclear. If a full novel has no obvious chapters: preserve the text, segment it cautiously, mark segmentation as inferred or provisional.

Scene boundary rules
Look for strong shifts in: time, location, point of view, action focus, conversation flow. If unclear, do not over-segment. Mark inferred scenes clearly. Scene detection should help the app, not create fake precision.

Character logic rules
Prioritize observed behavior over assumptions. Distinguish stable traits from temporary emotional states. Track what the character knows at the current point in the story. Avoid assigning psychological motives unless the text supports them. If behavior seems contradictory, note the tension instead of forcing one interpretation.

Conflict extraction rules
Distinguish conflict from general tension. Identify whether the conflict is: internal, interpersonal, external, world/systemic, mystery-driven. Track whether the conflict is unresolved, escalating, paused, or resolved. Preserve stakes whenever they are visible.

Foreshadowing and open loop rules
Only flag likely foreshadowing if a detail appears narratively meaningful or repeated. Do not label every detail as foreshadowing. Link possible setup to future unresolved questions when appropriate.
When extracting open loops: identify unanswered questions, identify unfinished emotional beats, identify unresolved promises to the reader.

Canon classification rules
confirmed_canon: Clearly established by the manuscript
flexible_canon: Present in the manuscript but potentially incomplete or not fully locked
draft_idea: Present in brainstorming/notes but not fully established in narrative reality
discarded: Explicitly abandoned or invalidated by the user or newer canon
Do not over-classify uncertain material as confirmed.

Confidence scoring rules
Every extracted entity (character, conflict, timeline event, world rule, location, theme, chapter, canon item, open loop, foreshadowing element) MUST include a "confidence" field: a number between 0.0 and 1.0 representing how certain the extraction is based on the source text.
- 0.9-1.0: Explicitly and clearly stated in the manuscript
- 0.7-0.89: Strongly implied by the text with high certainty
- 0.5-0.69: Moderately inferred — reasonable interpretation but not explicit
- 0.3-0.49: Weakly inferred — speculative, limited evidence
- 0.0-0.29: Very uncertain — minimal textual support
Always be honest about confidence. Do not inflate scores. When in doubt, round down.

Output format rules
You must always return:
A structured ingestion object matching the required schema.

Quality standards
Your extraction must be: accurate, source-grounded, conservative when uncertain, structured, reusable, continuity-aware.
Your goal is not to sound clever. Your goal is to make the manuscript usable as a living narrative system.

Behavioral constraints
You must not: invent unsupported details, merge unrelated characters carelessly, assume motives without evidence, hide ambiguity, overwrite confirmed canon silently, confuse inferred data with explicit manuscript facts, produce vague summaries without structured extraction.
You must: preserve evidence-based extraction, maintain clear distinctions, support future writing continuity, prepare the manuscript for assistant use across the app.

Final instruction
Treat every uploaded manuscript as a story system that must be understood, organized, and preserved.
Your job is to transform raw writing files into structured narrative intelligence that the app can trust.

When processing uploaded content, always respond with the structured extraction object using the required ingestion schema.
`;
}

const CHUNK_SIZE = 200000; // ~200K characters per chunk

function splitTextIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_SIZE) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= CHUNK_SIZE) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a chapter boundary within the chunk window
    let splitAt = -1;
    const searchWindow = remaining.substring(CHUNK_SIZE - 20000, CHUNK_SIZE + 5000);
    const chapterPattern = /\n\s*(?:cap[íi]tulo|chapter|parte|part)\s+/i;
    const match = searchWindow.match(chapterPattern);
    if (match && match.index !== undefined) {
      splitAt = CHUNK_SIZE - 20000 + match.index;
    }

    // Fall back to paragraph boundary
    if (splitAt === -1) {
      const lastParagraph = remaining.lastIndexOf('\n\n', CHUNK_SIZE);
      if (lastParagraph > CHUNK_SIZE * 0.5) {
        splitAt = lastParagraph;
      } else {
        splitAt = CHUNK_SIZE;
      }
    }

    chunks.push(remaining.substring(0, splitAt));
    remaining = remaining.substring(splitAt);
  }

  return chunks;
}

// ─── Deduplication helpers ────────────────────────────────────────
// Two-pass intra-batch dedup. Pass 1 collapses case-and-whitespace-equivalent
// entries within the incoming batch; for characters and locations we prefer
// the entry with the most filled-in fields, so a later mention with richer
// detail can fill in fields the first mention left blank.

function normalizeKey(s: string | undefined | null): string {
  return (s ?? '').toLowerCase().trim();
}

function isFieldEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function mergeMostComplete<T extends Record<string, unknown>>(a: T, b: T): T {
  const result: Record<string, unknown> = { ...a };
  for (const k of Object.keys(b)) {
    if (isFieldEmpty(result[k]) && !isFieldEmpty(b[k])) {
      result[k] = b[k];
    }
  }
  return result as T;
}

function dedupBatch<T>(
  items: T[] | undefined,
  keyFn: (item: T) => string,
  strategy: 'first-wins' | 'most-complete' = 'first-wins',
): T[] {
  if (!Array.isArray(items)) return [];
  const map = new Map<string, T>();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
    } else if (strategy === 'most-complete') {
      map.set(key, mergeMostComplete(existing as T & Record<string, unknown>, item as T & Record<string, unknown>) as T);
    }
    // first-wins: keep the existing entry untouched
  }
  return Array.from(map.values());
}

function relationshipKey(rel: { character_1?: string; character_2?: string }): string {
  const a = normalizeKey(rel.character_1);
  const b = normalizeKey(rel.character_2);
  if (!a || !b) return '';
  return [a, b].sort().join('||');
}

function mergeResults(results: ExtractedData[]): ExtractedData {
  // Concatenate every array field from every chunk first, then dedup once.
  const concat = <K extends keyof ExtractedData>(key: K): NonNullable<ExtractedData[K]> => {
    const out: unknown[] = [];
    for (const r of results) {
      const arr = r[key];
      if (Array.isArray(arr)) out.push(...arr);
    }
    return out as NonNullable<ExtractedData[K]>;
  };

  // Themes need bespoke merging — same theme across chunks should accumulate
  // evidence rather than dropping the second mention.
  const themeMap = new Map<string, ExtractedTheme>();
  for (const t of concat('themes') as ExtractedTheme[]) {
    const key = normalizeKey(t.theme);
    if (!key) continue;
    const existing = themeMap.get(key);
    if (!existing) {
      themeMap.set(key, { ...t, evidence: [...(t.evidence ?? [])] });
      continue;
    }
    const seenEvidence = new Set((existing.evidence ?? []).map(e => e.toLowerCase()));
    for (const e of t.evidence ?? []) {
      if (!seenEvidence.has(e.toLowerCase())) {
        existing.evidence = [...(existing.evidence ?? []), e];
        seenEvidence.add(e.toLowerCase());
      }
    }
  }

  return {
    project: results[0]?.project || {},
    chapters: dedupBatch(concat('chapters'), c => normalizeKey(c.chapter_id) || normalizeKey(c.title)),
    scenes: dedupBatch(concat('scenes'), s => normalizeKey(s.scene_id)),
    characters: dedupBatch<ExtractedCharacter>(
      concat('characters'),
      c => normalizeKey(c.name),
      'most-complete',
    ),
    character_states: dedupBatch(
      concat('character_states'),
      s => normalizeKey(s.character_id) || normalizeKey(s.name),
    ),
    relationships: dedupBatch(concat('relationships'), relationshipKey),
    active_conflicts: dedupBatch<ExtractedConflict>(
      concat('active_conflicts'),
      c => normalizeKey(c.title) || normalizeKey(c.conflict_type),
    ),
    timeline_events: dedupBatch<ExtractedTimelineEvent>(
      concat('timeline_events'),
      e => normalizeKey(e.event),
    ),
    world_rules: dedupBatch<ExtractedWorldRule>(
      concat('world_rules'),
      r => normalizeKey(r.rule),
    ),
    locations: dedupBatch<ExtractedLocation>(
      concat('locations'),
      l => normalizeKey(l.name),
      'most-complete',
    ),
    themes: Array.from(themeMap.values()),
    canon_items: dedupBatch(concat('canon_items'), c => normalizeKey(c.description)),
    ambiguities: dedupBatch(concat('ambiguities'), a => normalizeKey(a.issue)),
    open_loops: dedupBatch<ExtractedOpenLoop>(
      concat('open_loops'),
      l => normalizeKey(l.description),
    ),
    foreshadowing_elements: dedupBatch(
      concat('foreshadowing_elements'),
      f => normalizeKey(f.clue),
    ),
  };
}

// Allow up to 300s for large manuscript processing on Vercel (requires Pro plan; free tier caps at 60s)
export const maxDuration = 300;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file
const MAX_FILES = 10;
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];
// Aggregate guards: prevent DOS / cost-explosion from many large files summing into
// hundreds of MB of combined text (which would split into thousands of Gemini chunks).
const MAX_TOTAL_TEXT = 2_000_000; // ~2M chars (~10 large chunks)
const MAX_CHUNKS = 20;

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/ingest', requestId });
  const limited = await rateLimit(req, { maxRequests: 5, windowMs: 60000 });
  if (limited) return limited;

  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;

  const quotaResponse = await enforceAiQuota(authResult, { requestId });
  if (quotaResponse) return quotaResponse;

  try {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return err('validation_failed', 'Invalid request format. Expected multipart form data.', 400);
    }
    const files = formData.getAll('files') as File[];
    const language = (formData.get('language') as string) || 'English';

    if (!files || files.length === 0) {
      return err('validation_failed', 'No files uploaded', 400);
    }

    if (files.length > MAX_FILES) {
      return err('validation_failed', `Too many files (max ${MAX_FILES})`, 400);
    }

    // Validate files
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return err('validation_failed', `File "${file.name}" exceeds the 50MB size limit.`, 400);
      }
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return err(
          'validation_failed',
          `File "${file.name}" has an unsupported format. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
          400,
        );
      }
    }

    let combinedText = '';
    const fileParsingStatus: { name: string; status: string; error?: string }[] = [];

    // 1. Parse files
    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        let text = '';

        if (file.name.endsWith('.pdf')) {
          const textResult = await pdf(buffer);
          text = textResult.text;
        } else if (file.name.endsWith('.docx')) {
          const result = await mammoth.extractRawText({ buffer });
          text = result.value;
        } else if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
          text = buffer.toString('utf-8');
        } else {
          fileParsingStatus.push({ name: file.name, status: 'failed', error: 'Unsupported file type' });
          continue;
        }

        combinedText += `\n\n--- FILE: ${file.name} ---\n\n${text}`;
        fileParsingStatus.push({ name: file.name, status: 'success' });
      } catch (parseErr: unknown) {
        // Raw parser message goes to the logs only — library error strings can
        // leak file internals / dependency details to the client.
        log.error('Error parsing file', parseErr, {
          fileName: file.name,
          rawMessage: getErrorMessage(parseErr, 'Unknown parse error'),
        });
        fileParsingStatus.push({
          name: file.name,
          status: 'failed',
          error: 'Could not read this file. It may be corrupted or in an unsupported format.',
        });
      }
    }

    if (combinedText.trim() === '') {
      return err(
        'validation_failed',
        'No text could be extracted from the uploaded files.',
        400,
        { fileParsingStatus },
      );
    }

    if (combinedText.length > MAX_TOTAL_TEXT) {
      return err(
        'validation_failed',
        `Combined manuscript text is too large (${combinedText.length.toLocaleString()} chars, max ${MAX_TOTAL_TEXT.toLocaleString()}). Please upload a smaller subset of files.`,
        413,
        { fileParsingStatus },
      );
    }

    // 2. Split into chunks and analyze with Gemini
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return err('internal_error', 'API key not configured', 500);
    }

    const ai = new GoogleGenAI({ apiKey });
    const systemPrompt = buildSystemPrompt(language);
    const chunks = splitTextIntoChunks(combinedText);

    if (chunks.length > MAX_CHUNKS) {
      return err(
        'validation_failed',
        `Manuscript splits into too many processing chunks (${chunks.length}, max ${MAX_CHUNKS}). Please upload a smaller subset of files.`,
        413,
        { fileParsingStatus },
      );
    }

    log.info('Processing manuscript', { chunkCount: chunks.length, totalChars: combinedText.length });

    const results: ExtractedData[] = [];
    // Per-chunk outcome report, returned to the client so a partially
    // extracted manuscript is visible (which sections were skipped and why)
    // instead of silently missing data.
    const chunkStatus: {
      chunkIndex: number;
      status: 'ok' | 'skipped';
      reason?: 'safety' | 'truncated' | 'empty' | 'invalid-json';
    }[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkLabel = chunks.length > 1
        ? `\n\n[This is part ${i + 1} of ${chunks.length} of the manuscript. Extract all narrative data from this section.]\n\n`
        : '';

      const userPrompt = `${chunkLabel}<manuscript_content>\n${chunks[i]}\n</manuscript_content>`;

      log.info('Sending chunk to Gemini', { chunkIndex: i + 1, chunkCount: chunks.length, chunkChars: chunks[i].length });

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: AI_MODEL,
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            safetySettings: SAFETY_SETTINGS,
            // Disable "thinking" for gemini-2.5-flash: thinking tokens are
            // billed against maxOutputTokens and can consume the whole budget,
            // truncating the JSON body (same rationale as extract-world-bible).
            thinkingConfig: { thinkingBudget: 0 },
            responseMimeType: 'application/json',
            responseSchema,
          },
        }),
      );

      const candidate = response.candidates?.[0];
      const finishReason = candidate?.finishReason;
      if (finishReason === FinishReason.SAFETY || finishReason === FinishReason.PROHIBITED_CONTENT || finishReason === FinishReason.BLOCKLIST) {
        log.warn('Chunk blocked by safety filters; skipping', { chunkIndex: i + 1 });
        chunkStatus.push({ chunkIndex: i + 1, status: 'skipped', reason: 'safety' });
        continue;
      }

      if (finishReason === FinishReason.MAX_TOKENS) {
        // Output hit the token budget — the JSON is cut off mid-stream and
        // unusable. Distinct reason so the client can suggest fewer files.
        log.warn('Chunk output truncated at MAX_TOKENS; skipping', { chunkIndex: i + 1 });
        chunkStatus.push({ chunkIndex: i + 1, status: 'skipped', reason: 'truncated' });
        continue;
      }

      const rawText = response.text;
      if (!rawText) {
        log.warn('Chunk returned empty response; skipping', { chunkIndex: i + 1 });
        chunkStatus.push({ chunkIndex: i + 1, status: 'skipped', reason: 'empty' });
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        log.error('Chunk returned invalid JSON', undefined, {
          chunkIndex: i + 1,
          rawTextSample: rawText.slice(0, 500),
        });
        chunkStatus.push({ chunkIndex: i + 1, status: 'skipped', reason: 'invalid-json' });
        continue;
      }
      results.push(parsed);
      chunkStatus.push({ chunkIndex: i + 1, status: 'ok' });
      log.info('Chunk done', { chunkIndex: i + 1 });
    }

    if (results.length === 0) {
      return err(
        'upstream_unavailable',
        'AI failed to analyze the manuscript. Please try again.',
        502,
        { fileParsingStatus, chunkStatus },
      );
    }

    const extractedData = results.length === 1 ? results[0] : mergeResults(results);

    return ok({ fileParsingStatus, chunkStatus, extractedData });

  } catch (error: unknown) {
    log.error('Ingestion error', error);
    const status = getErrorStatus(error);
    return err(statusToCode(status), 'Failed to process files', status);
  }
}
