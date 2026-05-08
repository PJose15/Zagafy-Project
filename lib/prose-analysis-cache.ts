import { analyzeText, type ProseIssue } from '@/lib/prose-analysis';
import {
  getChapterAnalysis,
  putChapterAnalysis,
  type ChapterAnalysisRow,
} from '@/lib/storage/dexie-db';

/**
 * Phase 4.11 / CB-08 — content-hash-keyed cache for prose analysis.
 *
 * Re-running the analyzer on unchanged content was wasteful, especially on
 * long chapters. This module hashes the chapter content with SHA-256 and
 * stores the analyzer's result keyed by that hash. Cache hit: skip
 * analysis. Cache miss (or hash mismatch): re-analyze and persist.
 */

export interface CachedAnalysis {
  issues: ProseIssue[];
  contentHash: string;
  analyzedAt: number;
  fromCache: boolean;
}

/**
 * SHA-256 hex digest of `text`. Uses Web Crypto when available (browsers,
 * happy-dom, modern Node). Falls back to a 64-bit FNV-1a hex when subtle
 * crypto isn't reachable so analysis still works in degraded environments.
 */
export async function hashContent(text: string): Promise<string> {
  const subtle = (globalThis.crypto && globalThis.crypto.subtle) || null;
  if (subtle) {
    const buf = new TextEncoder().encode(text);
    const digest = await subtle.digest('SHA-256', buf);
    const bytes = new Uint8Array(digest);
    let out = '';
    for (const b of bytes) out += b.toString(16).padStart(2, '0');
    return out;
  }
  // Fallback: 64-bit FNV-1a (good enough for cache invalidation, not
  // cryptographic). Returns a hex string, prefixed so it can't be confused
  // with a SHA-256.
  let hi = 0x84222325;
  let lo = 0xcbf29ce4;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    lo = (lo ^ c) >>> 0;
    // multiply by FNV prime 0x100000001b3 = 2^40 + 2^8 + 0xb3
    const loProduct = lo * 0xb3 + (lo & 0xffffff) * 0x100;
    const hiProduct = hi * 0xb3 + lo * 0x100000001;
    lo = loProduct >>> 0;
    hi = (hiProduct + Math.floor(loProduct / 0x100000000)) >>> 0;
  }
  return 'fnv:' + hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
}

/**
 * Read cached analysis if the content hash matches; otherwise analyze and
 * persist the result. Always returns a result.
 */
export async function getOrAnalyze(
  chapterId: string,
  content: string,
): Promise<CachedAnalysis> {
  const contentHash = await hashContent(content);
  const cached: ChapterAnalysisRow<ProseIssue[]> | null =
    await getChapterAnalysis<ProseIssue[]>(chapterId);

  if (cached && cached.contentHash === contentHash) {
    return {
      issues: cached.data,
      contentHash,
      analyzedAt: cached.analyzedAt,
      fromCache: true,
    };
  }

  const issues = analyzeText(content);
  // Capture the timestamp once so the value we return matches what we
  // persist — otherwise a fresh-run + immediate cache-read can disagree by a
  // millisecond, which makes UX timestamps flicker.
  const analyzedAt = Date.now();
  await putChapterAnalysis(chapterId, contentHash, issues, analyzedAt);
  return {
    issues,
    contentHash,
    analyzedAt,
    fromCache: false,
  };
}

/** Read-only lookup — used by the reader to display "analyzed Xh ago". */
export async function readCachedAnalysis(
  chapterId: string,
  content: string,
): Promise<CachedAnalysis | null> {
  const cached = await getChapterAnalysis<ProseIssue[]>(chapterId);
  if (!cached) return null;
  const contentHash = await hashContent(content);
  if (cached.contentHash !== contentHash) return null;
  return {
    issues: cached.data,
    contentHash,
    analyzedAt: cached.analyzedAt,
    fromCache: true,
  };
}
