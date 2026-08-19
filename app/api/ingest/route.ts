import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type, FinishReason } from '@google/genai';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { rateLimit } from '@/lib/rate-limit';
import { AI_MODEL, SAFETY_SETTINGS, AI_CONFIG, THINKING_CONFIG } from '@/lib/ai-config';

// Per-chunk Gemini timeout — ingest may process up to 20 chunks sequentially, so
// bound each call well under maxDuration rather than sharing one budget.
const INGEST_CHUNK_TIMEOUT_MS = 60_000;
import { getErrorStatus, getErrorMessage } from '@/lib/api-error';
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
          raw_text_reference: { type: Type.STRING }
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
          core_traits: { type: Type.ARRAY, items: { type: Type.STRING } }
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
          status: { type: Type.STRING }
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
          latent_effect: { type: Type.STRING }
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
          rule: { type: Type.STRING }
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
          associated_rules: { type: Type.ARRAY, items: { type: Type.STRING } }
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
          evidence: { type: Type.ARRAY, items: { type: Type.STRING } }
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
          source_reference: { type: Type.STRING }
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
          status: { type: Type.STRING }
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
          payoff_status: { type: Type.STRING }
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

// Each chunk is extracted independently, so the model reuses IDs across chunks
// (e.g. two chunks both emit "chapter_1"). Prefix every ID with the chunk index
// to make them globally unique while keeping intra-chunk references (scene→chapter,
// state→character) valid — both the definition and the reference get the same
// prefix. Relationship endpoints use names, not IDs, so they are left alone.
const CHUNK_ID_FIELDS: Record<string, string[]> = {
  chapters: ['chapter_id'],
  scenes: ['scene_id', 'chapter_id'],
  characters: ['character_id'],
  character_states: ['character_id'],
  active_conflicts: ['conflict_id'],
  timeline_events: ['timeline_event_id'],
  world_rules: ['world_rule_id'],
  locations: ['location_id'],
  themes: ['theme_id'],
  canon_items: ['canon_item_id'],
  ambiguities: ['ambiguity_id'],
  open_loops: ['loop_id'],
  foreshadowing_elements: ['foreshadowing_id'],
};

function namespaceChunkIds(parsed: Record<string, unknown>, chunkIndex: number): void {
  const prefix = `c${chunkIndex}_`;
  const p = (v: unknown) => (typeof v === 'string' && v ? prefix + v : v);
  for (const [key, fields] of Object.entries(CHUNK_ID_FIELDS)) {
    const arr = parsed[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr as Record<string, unknown>[]) {
      if (item && typeof item === 'object') {
        for (const f of fields) item[f] = p(item[f]);
      }
    }
  }
}

function mergeResults(results: ExtractedData[]): ExtractedData {
  const merged: ExtractedData = {
    project: results[0]?.project || {},
    chapters: [],
    scenes: [],
    characters: [],
    character_states: [],
    relationships: [],
    active_conflicts: [],
    timeline_events: [],
    world_rules: [],
    locations: [],
    themes: [],
    canon_items: [],
    ambiguities: [],
    open_loops: [],
    foreshadowing_elements: [],
  };

  const arrayKeys = (Object.keys(merged) as (keyof ExtractedData)[]).filter(k => k !== 'project');

  for (const result of results) {
    for (const key of arrayKeys) {
      const source = result[key];
      const target = merged[key];
      if (Array.isArray(source) && Array.isArray(target)) {
        target.push(...source);
      }
    }
  }

  // Deduplicate characters by name
  const seenCharacters = new Map<string, ExtractedCharacter>();
  for (const char of merged.characters!) {
    const key = char.name?.toLowerCase();
    if (key && !seenCharacters.has(key)) {
      seenCharacters.set(key, char);
    }
  }
  merged.characters = Array.from(seenCharacters.values());

  // A character appearing in multiple chunks is collapsed to its first (canonical)
  // record above, but its per-chunk character_states still point at the dropped
  // duplicates' ids. Re-point each state at the surviving character by name so the
  // links aren't orphaned.
  const canonicalCharIdByName = new Map<string, string>();
  for (const char of merged.characters!) {
    if (char.name && char.character_id) canonicalCharIdByName.set(char.name.toLowerCase(), char.character_id);
  }
  for (const st of merged.character_states!) {
    const canonical = st.name ? canonicalCharIdByName.get(st.name.toLowerCase()) : undefined;
    if (canonical) st.character_id = canonical;
  }

  // Deduplicate locations by name
  const seenLocations = new Map<string, ExtractedLocation>();
  for (const loc of merged.locations!) {
    const key = loc.name?.toLowerCase();
    if (key && !seenLocations.has(key)) {
      seenLocations.set(key, loc);
    }
  }
  merged.locations = Array.from(seenLocations.values());

  // Deduplicate conflicts by title
  const seenConflicts = new Map<string, ExtractedConflict>();
  for (const conflict of merged.active_conflicts!) {
    const key = (conflict.title || conflict.conflict_type || '')?.toLowerCase().trim();
    if (key && !seenConflicts.has(key)) {
      seenConflicts.set(key, conflict);
    }
  }
  merged.active_conflicts = Array.from(seenConflicts.values());

  // Deduplicate timeline events by event name
  const seenTimeline = new Map<string, ExtractedTimelineEvent>();
  for (const event of merged.timeline_events!) {
    const key = (event.event || '')?.toLowerCase().trim();
    if (key && !seenTimeline.has(key)) {
      seenTimeline.set(key, event);
    }
  }
  merged.timeline_events = Array.from(seenTimeline.values());

  // Deduplicate world rules by rule text
  const seenRules = new Map<string, ExtractedWorldRule>();
  for (const rule of merged.world_rules!) {
    const key = (rule.rule || '')?.toLowerCase().trim();
    if (key && !seenRules.has(key)) {
      seenRules.set(key, rule);
    }
  }
  merged.world_rules = Array.from(seenRules.values());

  // Deduplicate themes by theme name, merging evidence arrays
  const seenThemes = new Map<string, ExtractedTheme>();
  for (const theme of merged.themes!) {
    const key = (theme.theme || '')?.toLowerCase().trim();
    if (key) {
      if (seenThemes.has(key)) {
        const existing = seenThemes.get(key)!;
        const mergedEvidence = [...(existing.evidence || [])];
        for (const e of (theme.evidence || [])) {
          if (!mergedEvidence.some((me: string) => me.toLowerCase() === e.toLowerCase())) {
            mergedEvidence.push(e);
          }
        }
        existing.evidence = mergedEvidence;
      } else {
        seenThemes.set(key, { ...theme });
      }
    }
  }
  merged.themes = Array.from(seenThemes.values());

  // Deduplicate open loops by description
  const seenLoops = new Map<string, ExtractedOpenLoop>();
  for (const loop of merged.open_loops!) {
    const key = (loop.description || '')?.toLowerCase().trim();
    if (key && !seenLoops.has(key)) {
      seenLoops.set(key, loop);
    }
  }
  merged.open_loops = Array.from(seenLoops.values());

  return merged;
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
// Reject oversized uploads by Content-Length before buffering the whole body into
// memory (MAX_FILES × MAX_FILE_SIZE, plus a little multipart overhead).
const MAX_REQUEST_BYTES = MAX_FILES * MAX_FILE_SIZE + 1_000_000;

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, { maxRequests: 5, windowMs: 60000 });
  if (limited) return limited;

  try {
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > MAX_REQUEST_BYTES) {
      return NextResponse.json(
        { error: 'Upload too large.' },
        { status: 413 }
      );
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid request format. Expected multipart form data.' }, { status: 400 });
    }
    const files = formData.getAll('files') as File[];
    const language = (formData.get('language') as string) || 'English';

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Too many files (max ${MAX_FILES})` }, { status: 400 });
    }

    // Validate files
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds the 50MB size limit.` },
          { status: 400 }
        );
      }
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return NextResponse.json(
          { error: `File "${file.name}" has an unsupported format. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` },
          { status: 400 }
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
      } catch (err: unknown) {
        // Log the real parser error server-side, but return a generic message to
        // the client — library errors can leak internal paths / dependency details.
        console.error(`Error parsing ${file.name}:`, err);
        fileParsingStatus.push({ name: file.name, status: 'failed', error: 'Could not parse this file' });
      }
    }

    if (combinedText.trim() === '') {
      return NextResponse.json({ error: 'No text could be extracted from the uploaded files.', fileParsingStatus }, { status: 400 });
    }

    if (combinedText.length > MAX_TOTAL_TEXT) {
      return NextResponse.json(
        {
          error: `Combined manuscript text is too large (${combinedText.length.toLocaleString()} chars, max ${MAX_TOTAL_TEXT.toLocaleString()}). Please upload a smaller subset of files.`,
          fileParsingStatus,
        },
        { status: 413 }
      );
    }

    // 2. Split into chunks and analyze with Gemini
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const systemPrompt = buildSystemPrompt(language);
    const chunks = splitTextIntoChunks(combinedText);

    if (chunks.length > MAX_CHUNKS) {
      return NextResponse.json(
        {
          error: `Manuscript splits into too many processing chunks (${chunks.length}, max ${MAX_CHUNKS}). Please upload a smaller subset of files.`,
          fileParsingStatus,
        },
        { status: 413 }
      );
    }

    console.log(`Processing ${chunks.length} chunk(s), total ${combinedText.length} characters`);

    const results: ExtractedData[] = [];
    // Track chunks that produced no usable data so we can tell the user their
    // ingested manuscript is incomplete instead of silently dropping sections.
    const skippedChunks: { chunk: number; reason: string }[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkLabel = chunks.length > 1
        ? `\n\n[This is part ${i + 1} of ${chunks.length} of the manuscript. Extract all narrative data from this section.]\n\n`
        : '';

      const userPrompt = `${chunkLabel}<manuscript_content>\n${chunks[i]}\n</manuscript_content>`;

      console.log(`Sending chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`);

      const response = await ai.models.generateContent({
        model: AI_MODEL,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          safetySettings: SAFETY_SETTINGS,
          // Disable thinking + set an explicit output cap so a data-dense chunk
          // isn't truncated mid-JSON (which would drop the whole chunk below).
          thinkingConfig: THINKING_CONFIG,
          temperature: AI_CONFIG.ingest.temperature,
          maxOutputTokens: AI_CONFIG.ingest.maxOutputTokens,
          responseMimeType: 'application/json',
          responseSchema,
          abortSignal: AbortSignal.timeout(INGEST_CHUNK_TIMEOUT_MS),
        }
      });

      const candidate = response.candidates?.[0];
      const finishReason = candidate?.finishReason;
      if (finishReason === FinishReason.SAFETY || finishReason === FinishReason.PROHIBITED_CONTENT || finishReason === FinishReason.BLOCKLIST) {
        console.warn(`Chunk ${i + 1} was blocked by safety filters, skipping.`);
        skippedChunks.push({ chunk: i + 1, reason: 'blocked' });
        continue;
      }
      if (finishReason === FinishReason.MAX_TOKENS) {
        console.warn(`Chunk ${i + 1} hit the output token limit; extraction may be truncated.`);
      }

      const rawText = response.text;
      if (!rawText) {
        console.warn(`Chunk ${i + 1} returned empty response, skipping.`);
        skippedChunks.push({ chunk: i + 1, reason: 'empty' });
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        console.error(`Chunk ${i + 1}: Gemini returned invalid JSON:`, rawText.slice(0, 500));
        skippedChunks.push({ chunk: i + 1, reason: finishReason === FinishReason.MAX_TOKENS ? 'truncated' : 'invalid-json' });
        continue;
      }
      // Namespace IDs per chunk so cross-chunk collisions don't corrupt the merged
      // graph (only meaningful with multiple chunks).
      if (chunks.length > 1 && parsed && typeof parsed === 'object') {
        namespaceChunkIds(parsed as Record<string, unknown>, i);
      }
      results.push(parsed);
      console.log(`Chunk ${i + 1} done.`);
    }

    if (results.length === 0) {
      return NextResponse.json(
        { error: 'AI failed to analyze the manuscript. Please try again.', fileParsingStatus },
        { status: 502 }
      );
    }

    const extractedData = results.length === 1 ? results[0] : mergeResults(results);

    return NextResponse.json({
      fileParsingStatus,
      extractedData,
      // Present only on partial extraction — lets the client warn that some
      // sections of the manuscript could not be ingested.
      ...(skippedChunks.length > 0
        ? { partial: true, skippedChunks, totalChunks: chunks.length }
        : {}),
    });

  } catch (error: unknown) {
    console.error('Ingestion error:', error);
    const status = getErrorStatus(error);
    return NextResponse.json({ error: 'Failed to process files' }, { status });
  }
}
