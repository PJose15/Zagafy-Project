// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { ExtractedData } from '@/lib/types/extracted-data';

// Mock rate-limit to always allow
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
}));

// Mock @google/genai
const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => {
  const MockGoogleGenAI = class {
    models = { generateContent: mockGenerateContent };
  };
  return {
    GoogleGenAI: MockGoogleGenAI,
    Type: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      ARRAY: 'ARRAY',
      INTEGER: 'INTEGER',
    },
    FinishReason: {
      SAFETY: 'SAFETY',
      PROHIBITED_CONTENT: 'PROHIBITED_CONTENT',
      BLOCKLIST: 'BLOCKLIST',
      MAX_TOKENS: 'MAX_TOKENS',
    },
  };
});

vi.mock('@/lib/ai-config', () => ({
  AI_MODEL: 'test-model',
  SAFETY_SETTINGS: [],
}));

// Mock pdf-parse and mammoth with per-test controllable fns
const mockPdfParse = vi.fn().mockResolvedValue({ text: 'Parsed PDF text' });
vi.mock('pdf-parse', () => ({
  default: (...args: unknown[]) => mockPdfParse(...args),
}));

const mockMammoth = vi.fn().mockResolvedValue({ value: 'Parsed DOCX text' });
vi.mock('mammoth', () => ({
  default: {
    extractRawText: (...args: unknown[]) => mockMammoth(...args),
  },
}));

const { POST } = await import('@/app/api/ingest/route');

// ─── Constants ───────────────────────────────────────────────────
const CHUNK_SIZE = 200_000;

// ─── Helpers ─────────────────────────────────────────────────────
function makeExtractedData(overrides: Partial<ExtractedData> = {}): ExtractedData {
  return {
    project: { title: 'Test', genre: ['fiction'] },
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
    ...overrides,
  };
}

function mockSuccessResponse(data: ExtractedData) {
  return {
    candidates: [{ finishReason: 'STOP' }],
    text: JSON.stringify(data),
  };
}

function makeFormRequest(
  files: { name: string; content: string; type?: string }[],
  language = 'English'
): NextRequest {
  const formData = new FormData();
  formData.set('language', language);
  for (const f of files) {
    const blob = new Blob([f.content], { type: f.type || 'text/plain' });
    formData.append('files', new File([blob], f.name));
  }
  return new NextRequest('http://localhost:3000/api/ingest', {
    method: 'POST',
    body: formData,
  });
}

// ─── Tests ───────────────────────────────────────────────────────
describe('POST /api/ingest', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    mockGenerateContent.mockReset();
    mockPdfParse.mockReset().mockResolvedValue({ text: 'Parsed PDF text' });
    mockMammoth.mockReset().mockResolvedValue({ value: 'Parsed DOCX text' });
  });

  // ── Existing validation tests ──────────────────────────────────
  it('rejects request with no files', async () => {
    const formData = new FormData();
    formData.set('language', 'English');
    const req = new NextRequest('http://localhost:3000/api/ingest', {
      method: 'POST',
      body: formData,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/No files/);
  });

  it('rejects unsupported file extension', async () => {
    const res = await POST(makeFormRequest([{ name: 'script.js', content: 'var x = 1;' }]));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unsupported format/);
  });

  it('rejects too many files', async () => {
    const files = Array.from({ length: 11 }, (_, i) => ({
      name: `file${i}.txt`,
      content: 'text',
    }));
    const res = await POST(makeFormRequest(files));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Too many files/);
  });

  it('rejects combined text exceeding MAX_TOTAL_TEXT with 413', async () => {
    // 3 files × 800K chars = 2.4M combined (> 2M cap)
    const chunk = 'a'.repeat(800_000);
    const files = [
      { name: 'a.txt', content: chunk },
      { name: 'b.txt', content: chunk },
      { name: 'c.txt', content: chunk },
    ];
    const res = await POST(makeFormRequest(files));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(/Combined manuscript text is too large/);
    // AI should not have been called
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('processes a valid .txt file successfully', async () => {
    const extractedData = makeExtractedData();

    mockGenerateContent.mockResolvedValue(mockSuccessResponse(extractedData));

    const res = await POST(
      makeFormRequest([{ name: 'manuscript.txt', content: 'Chapter 1\nOnce upon a time...' }])
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fileParsingStatus).toHaveLength(1);
    expect(body.fileParsingStatus[0].status).toBe('success');
    expect(body.extractedData.project.title).toBe('Test');
  });

  it('returns 500 when GEMINI_API_KEY is not set', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const res = await POST(
      makeFormRequest([{ name: 'story.txt', content: 'Some text' }])
    );
    expect(res.status).toBe(500);
  });

  it('handles .md files the same as .txt', async () => {
    mockGenerateContent.mockResolvedValue(mockSuccessResponse(makeExtractedData()));

    const res = await POST(
      makeFormRequest([{ name: 'notes.md', content: '# Chapter 1\nSome notes' }])
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fileParsingStatus[0].status).toBe('success');
  });

  // ── Group A: Text chunking ─────────────────────────────────────
  describe('text chunking', () => {
    it('sends 1 AI call for text under chunk size', async () => {
      mockGenerateContent.mockResolvedValue(mockSuccessResponse(makeExtractedData()));

      const shortText = 'A'.repeat(1000);
      await POST(makeFormRequest([{ name: 'short.txt', content: shortText }]));
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('sends 2 AI calls when text exceeds chunk size with chapter boundary', async () => {
      mockGenerateContent.mockResolvedValue(mockSuccessResponse(makeExtractedData()));

      const padding = 'x'.repeat(CHUNK_SIZE - 10000);
      const bigText = padding + '\nChapter 2\n' + 'y'.repeat(50000);
      await POST(makeFormRequest([{ name: 'big.txt', content: bigText }]));
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it('sends 2 AI calls falling back to paragraph split when no chapter heading', async () => {
      mockGenerateContent.mockResolvedValue(mockSuccessResponse(makeExtractedData()));

      const halfChunk = 'w'.repeat(CHUNK_SIZE * 0.6);
      const bigText = halfChunk + '\n\n' + 'z'.repeat(CHUNK_SIZE * 0.6);
      await POST(makeFormRequest([{ name: 'big.txt', content: bigText }]));
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });
  });

  // ── Group B: Result merging & dedup ────────────────────────────
  describe('result merging & deduplication', () => {
    function makeBigText() {
      return 'a'.repeat(CHUNK_SIZE + 50000);
    }

    it('uses project from first chunk', async () => {
      const chunk1 = makeExtractedData({ project: { title: 'First Title' } });
      const chunk2 = makeExtractedData({ project: { title: 'Second Title' } });

      mockGenerateContent
        .mockResolvedValueOnce(mockSuccessResponse(chunk1))
        .mockResolvedValueOnce(mockSuccessResponse(chunk2));

      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      const body = await res.json();
      expect(body.extractedData.project.title).toBe('First Title');
    });

    it('concatenates chapter arrays across chunks', async () => {
      const chunk1 = makeExtractedData({ chapters: [{ chapter_id: 'ch1', title: 'One' }] });
      const chunk2 = makeExtractedData({ chapters: [{ chapter_id: 'ch2', title: 'Two' }] });

      mockGenerateContent
        .mockResolvedValueOnce(mockSuccessResponse(chunk1))
        .mockResolvedValueOnce(mockSuccessResponse(chunk2));

      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      const body = await res.json();
      expect(body.extractedData.chapters).toHaveLength(2);
    });

    it('deduplicates characters by name (case-insensitive, first wins)', async () => {
      const chunk1 = makeExtractedData({
        characters: [{ name: 'Alice', role: 'protagonist' }],
      });
      const chunk2 = makeExtractedData({
        characters: [{ name: 'alice', role: 'sidekick' }, { name: 'Bob', role: 'antagonist' }],
      });

      mockGenerateContent
        .mockResolvedValueOnce(mockSuccessResponse(chunk1))
        .mockResolvedValueOnce(mockSuccessResponse(chunk2));

      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      const body = await res.json();
      expect(body.extractedData.characters).toHaveLength(2);
      expect(body.extractedData.characters[0].role).toBe('protagonist');
    });

    it('deduplicates locations by name', async () => {
      const chunk1 = makeExtractedData({
        locations: [{ name: 'Castle' }],
      });
      const chunk2 = makeExtractedData({
        locations: [{ name: 'castle' }, { name: 'Forest' }],
      });

      mockGenerateContent
        .mockResolvedValueOnce(mockSuccessResponse(chunk1))
        .mockResolvedValueOnce(mockSuccessResponse(chunk2));

      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      const body = await res.json();
      expect(body.extractedData.locations).toHaveLength(2);
    });

    it('deduplicates conflicts by title', async () => {
      const chunk1 = makeExtractedData({
        active_conflicts: [{ title: 'War', conflict_type: 'external' }],
      });
      const chunk2 = makeExtractedData({
        active_conflicts: [{ title: 'war', conflict_type: 'external' }, { title: 'Love Triangle' }],
      });

      mockGenerateContent
        .mockResolvedValueOnce(mockSuccessResponse(chunk1))
        .mockResolvedValueOnce(mockSuccessResponse(chunk2));

      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      const body = await res.json();
      expect(body.extractedData.active_conflicts).toHaveLength(2);
    });

    it('deduplicates timeline events by event text', async () => {
      const chunk1 = makeExtractedData({
        timeline_events: [{ event: 'Battle begins' }],
      });
      const chunk2 = makeExtractedData({
        timeline_events: [{ event: 'battle begins' }, { event: 'Treaty signed' }],
      });

      mockGenerateContent
        .mockResolvedValueOnce(mockSuccessResponse(chunk1))
        .mockResolvedValueOnce(mockSuccessResponse(chunk2));

      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      const body = await res.json();
      expect(body.extractedData.timeline_events).toHaveLength(2);
    });

    it('deduplicates world rules by rule text', async () => {
      const chunk1 = makeExtractedData({
        world_rules: [{ rule: 'Magic requires blood' }],
      });
      const chunk2 = makeExtractedData({
        world_rules: [{ rule: 'magic requires blood' }, { rule: 'Iron repels fae' }],
      });

      mockGenerateContent
        .mockResolvedValueOnce(mockSuccessResponse(chunk1))
        .mockResolvedValueOnce(mockSuccessResponse(chunk2));

      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      const body = await res.json();
      expect(body.extractedData.world_rules).toHaveLength(2);
    });

    it('merges theme evidence arrays without dropping theme', async () => {
      const chunk1 = makeExtractedData({
        themes: [{ theme: 'Redemption', evidence: ['Chapter 1 scene'] }],
      });
      const chunk2 = makeExtractedData({
        themes: [{ theme: 'redemption', evidence: ['Chapter 5 scene'] }],
      });

      mockGenerateContent
        .mockResolvedValueOnce(mockSuccessResponse(chunk1))
        .mockResolvedValueOnce(mockSuccessResponse(chunk2));

      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      const body = await res.json();
      expect(body.extractedData.themes).toHaveLength(1);
      expect(body.extractedData.themes[0].evidence).toHaveLength(2);
      expect(body.extractedData.themes[0].evidence).toContain('Chapter 1 scene');
      expect(body.extractedData.themes[0].evidence).toContain('Chapter 5 scene');
    });

    it('deduplicates theme evidence entries (case-insensitive)', async () => {
      const chunk1 = makeExtractedData({
        themes: [{ theme: 'Justice', evidence: ['Court scene'] }],
      });
      const chunk2 = makeExtractedData({
        themes: [{ theme: 'justice', evidence: ['court scene', 'New evidence'] }],
      });

      mockGenerateContent
        .mockResolvedValueOnce(mockSuccessResponse(chunk1))
        .mockResolvedValueOnce(mockSuccessResponse(chunk2));

      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      const body = await res.json();
      expect(body.extractedData.themes[0].evidence).toHaveLength(2);
      expect(body.extractedData.themes[0].evidence).toContain('Court scene');
      expect(body.extractedData.themes[0].evidence).toContain('New evidence');
    });

    it('deduplicates open loops by description', async () => {
      const chunk1 = makeExtractedData({
        open_loops: [{ description: 'Missing letter' }],
      });
      const chunk2 = makeExtractedData({
        open_loops: [{ description: 'missing letter' }, { description: 'Hidden treasure' }],
      });

      mockGenerateContent
        .mockResolvedValueOnce(mockSuccessResponse(chunk1))
        .mockResolvedValueOnce(mockSuccessResponse(chunk2));

      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      const body = await res.json();
      expect(body.extractedData.open_loops).toHaveLength(2);
    });

    // ── CB-06 (Phase 1.5) — intra-batch dedup, whitespace, most-complete ──

    it('collapses 5 mentions of the same character within one chunk to 1 (intra-batch)', async () => {
      const chunk = makeExtractedData({
        characters: [
          { name: 'Aragorn', role: 'ranger' },
          { name: 'aragorn', role: 'ranger' },
          { name: 'ARAGORN', role: 'ranger' },
          { name: 'Aragorn ', role: 'ranger' },
          { name: ' aragorn', role: 'ranger' },
        ],
      });
      mockGenerateContent
        .mockResolvedValueOnce(mockSuccessResponse(chunk))
        .mockResolvedValueOnce(mockSuccessResponse(makeExtractedData()));
      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      const body = await res.json();
      expect(body.extractedData.characters).toHaveLength(1);
      expect(body.extractedData.characters[0].name).toBe('Aragorn');
    });

    it('treats whitespace-equivalent character names as the same entity', async () => {
      const chunk1 = makeExtractedData({
        characters: [{ name: 'Frodo Baggins', role: 'hobbit' }],
      });
      const chunk2 = makeExtractedData({
        characters: [{ name: '  frodo baggins  ', role: 'hobbit' }],
      });
      mockGenerateContent
        .mockResolvedValueOnce(mockSuccessResponse(chunk1))
        .mockResolvedValueOnce(mockSuccessResponse(chunk2));
      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      const body = await res.json();
      expect(body.extractedData.characters).toHaveLength(1);
    });

    it('uses most-complete merge for characters: later non-empty fields fill earlier blanks', async () => {
      const chunk1 = makeExtractedData({
        characters: [{ name: 'Alice', role: 'protagonist', description: '' }],
      });
      const chunk2 = makeExtractedData({
        characters: [{ name: 'alice', role: 'sidekick', description: 'A girl from Wonderland' }],
      });
      mockGenerateContent
        .mockResolvedValueOnce(mockSuccessResponse(chunk1))
        .mockResolvedValueOnce(mockSuccessResponse(chunk2));
      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      const body = await res.json();
      expect(body.extractedData.characters).toHaveLength(1);
      // First-occurrence wins for filled fields; blanks fill from later mentions.
      expect(body.extractedData.characters[0].role).toBe('protagonist');
      expect(body.extractedData.characters[0].description).toBe('A girl from Wonderland');
    });

    it('uses most-complete merge for locations as well', async () => {
      const chunk1 = makeExtractedData({
        locations: [{ name: 'Castle', description: '' }],
      });
      const chunk2 = makeExtractedData({
        locations: [{ name: 'castle', description: 'On the hill' }],
      });
      mockGenerateContent
        .mockResolvedValueOnce(mockSuccessResponse(chunk1))
        .mockResolvedValueOnce(mockSuccessResponse(chunk2));
      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      const body = await res.json();
      expect(body.extractedData.locations).toHaveLength(1);
      expect(body.extractedData.locations[0].description).toBe('On the hill');
    });

    it('deduplicates relationships regardless of pair ordering', async () => {
      const chunk1 = makeExtractedData({
        relationships: [{ character_1: 'Alice', character_2: 'Bob', current_dynamic: 'allies' }],
      });
      const chunk2 = makeExtractedData({
        relationships: [{ character_1: 'bob', character_2: 'alice', current_dynamic: 'rivals' }],
      });
      mockGenerateContent
        .mockResolvedValueOnce(mockSuccessResponse(chunk1))
        .mockResolvedValueOnce(mockSuccessResponse(chunk2));
      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      const body = await res.json();
      expect(body.extractedData.relationships).toHaveLength(1);
    });

    it('deduplicates chapters by chapter_id (or title fallback)', async () => {
      const chunk1 = makeExtractedData({
        chapters: [{ chapter_id: 'ch-1', title: 'Beginnings', summary: 'They meet.' }],
      });
      const chunk2 = makeExtractedData({
        chapters: [
          { chapter_id: 'ch-1', title: 'Beginnings revised', summary: '' },
          { chapter_id: 'ch-2', title: 'The Journey' },
        ],
      });
      mockGenerateContent
        .mockResolvedValueOnce(mockSuccessResponse(chunk1))
        .mockResolvedValueOnce(mockSuccessResponse(chunk2));
      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      const body = await res.json();
      expect(body.extractedData.chapters).toHaveLength(2);
    });

    it('skips entries with empty key fields rather than collapsing them all together', async () => {
      const chunk = makeExtractedData({
        characters: [{ name: '', role: 'A' }, { name: '   ', role: 'B' }, { name: 'Real', role: 'C' }],
      });
      mockGenerateContent
        .mockResolvedValueOnce(mockSuccessResponse(chunk))
        .mockResolvedValueOnce(mockSuccessResponse(makeExtractedData()));
      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      const body = await res.json();
      expect(body.extractedData.characters).toHaveLength(1);
      expect(body.extractedData.characters[0].name).toBe('Real');
    });
  });

  // ── Group C: Chunk processing edge cases ───────────────────────
  describe('chunk processing edge cases', () => {
    function makeBigText() {
      return 'a'.repeat(CHUNK_SIZE + 50000);
    }

    it('skips safety-filtered chunk, other chunks still processed → 200', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({
          candidates: [{ finishReason: 'SAFETY' }],
          text: null,
        })
        .mockResolvedValueOnce(mockSuccessResponse(makeExtractedData()));

      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      expect(res.status).toBe(200);
    });

    it('skips chunk with invalid JSON, other chunks still processed → 200', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({
          candidates: [{ finishReason: 'STOP' }],
          text: 'not valid json {{{',
        })
        .mockResolvedValueOnce(mockSuccessResponse(makeExtractedData()));

      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      expect(res.status).toBe(200);
    });

    it('skips chunk with empty text response → 200', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({
          candidates: [{ finishReason: 'STOP' }],
          text: '',
        })
        .mockResolvedValueOnce(mockSuccessResponse(makeExtractedData()));

      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      expect(res.status).toBe(200);
    });

    it('returns 502 when all chunks fail', async () => {
      mockGenerateContent
        .mockResolvedValueOnce({
          candidates: [{ finishReason: 'SAFETY' }],
          text: null,
        })
        .mockResolvedValueOnce({
          candidates: [{ finishReason: 'STOP' }],
          text: 'bad json',
        });

      const res = await POST(makeFormRequest([{ name: 'big.txt', content: makeBigText() }]));
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toMatch(/AI failed/);
    });
  });

  // ── Group D: File parsing errors ───────────────────────────────
  describe('file parsing errors', () => {
    it('reports PDF parse failure in fileParsingStatus', async () => {
      mockPdfParse.mockRejectedValueOnce(new Error('Corrupt PDF'));
      mockGenerateContent.mockResolvedValue(mockSuccessResponse(makeExtractedData()));

      const res = await POST(
        makeFormRequest([
          { name: 'bad.pdf', content: 'fake-pdf' },
          { name: 'good.txt', content: 'Some text' },
        ])
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      const pdfStatus = body.fileParsingStatus.find((f: { name: string }) => f.name === 'bad.pdf');
      expect(pdfStatus.status).toBe('failed');
      expect(pdfStatus.error).toBe('Corrupt PDF');
    });

    it('handles mixed files: one fails, one succeeds → 200 with partial status', async () => {
      mockMammoth.mockRejectedValueOnce(new Error('Corrupt DOCX'));
      mockGenerateContent.mockResolvedValue(mockSuccessResponse(makeExtractedData()));

      const res = await POST(
        makeFormRequest([
          { name: 'bad.docx', content: 'fake-docx' },
          { name: 'good.txt', content: 'Real text content' },
        ])
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      const docxStatus = body.fileParsingStatus.find((f: { name: string }) => f.name === 'bad.docx');
      const txtStatus = body.fileParsingStatus.find((f: { name: string }) => f.name === 'good.txt');
      expect(docxStatus.status).toBe('failed');
      expect(txtStatus.status).toBe('success');
    });
  });

  // ── Group E: Outer catch block ─────────────────────────────────
  describe('outer catch block', () => {
    it('returns status from error with { status: 503 }', async () => {
      mockGenerateContent.mockRejectedValue({ status: 503, message: 'Service Unavailable' });

      const res = await POST(
        makeFormRequest([{ name: 'story.txt', content: 'text' }])
      );
      expect(res.status).toBe(503);
    });

    it('returns 500 for plain Error without status', async () => {
      mockGenerateContent.mockRejectedValue(new Error('Something broke'));

      const res = await POST(
        makeFormRequest([{ name: 'story.txt', content: 'text' }])
      );
      expect(res.status).toBe(500);
    });
  });
});
