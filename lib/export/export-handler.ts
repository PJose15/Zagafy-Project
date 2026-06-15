/**
 * MP-04 — shared request handling for the DOCX/PDF export routes.
 *
 * Parses + validates the manuscript payload, enforces the free-tier export
 * rate cap (paid tiers and self-hosted embed mode are unlimited), and exposes
 * helpers for the binary download response.
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser, isAuthError } from '@/lib/auth';
import { err } from '@/lib/api-response';
import { planMeetsRequirement } from '@/lib/billing';
import { getUserPlan } from './get-user-plan';
import {
  buildManuscriptModel,
  type ManuscriptModel,
  type RawChapter,
  type ManuscriptAuthor,
} from './manuscript-model';

// Free-tier cap: a handful of exports per hour. Paid tiers are unlimited.
const FREE_TIER_MAX = 5;
const FREE_TIER_WINDOW_MS = 60 * 60 * 1000;
const MAX_CHAPTERS = 500;
const MAX_TOTAL_CONTENT = 8_000_000; // ~8MB of chapter text, defensive

export type PrepareResult =
  | { ok: false; response: NextResponse }
  | { ok: true; model: ManuscriptModel; filenameBase: string };

function asAuthor(value: unknown): ManuscriptAuthor {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    name: typeof v.name === 'string' ? v.name.slice(0, 200) : '',
    email: typeof v.email === 'string' ? v.email.slice(0, 200) : undefined,
    address: typeof v.address === 'string' ? v.address.slice(0, 500) : undefined,
  };
}

/** Sanitize a manuscript title into a safe download filename stem. */
export function sanitizeFilename(title: string): string {
  const base = title
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return base || 'manuscript';
}

export async function prepareExport(req: NextRequest): Promise<PrepareResult> {
  // Auth first so we can read the caller's plan for tier-aware gating.
  const authResult = await requireUser();
  if (isAuthError(authResult)) return { ok: false, response: authResult };

  // Free tier (and unknown plans) are rate-capped; paid tiers and embed mode
  // (self-hosted, no billing) are unlimited.
  let unlimited = authResult.embedMode;
  if (!unlimited) {
    const plan = await getUserPlan(authResult.userId);
    unlimited = planMeetsRequirement(plan, 'writer');
  }
  if (!unlimited) {
    const limited = await rateLimit(req, { maxRequests: FREE_TIER_MAX, windowMs: FREE_TIER_WINDOW_MS });
    if (limited) return { ok: false, response: limited };
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { ok: false, response: err('parse_error', 'Invalid JSON body', 400) };
  }

  const b = (body ?? {}) as Record<string, unknown>;
  const title = typeof b.title === 'string' ? b.title : '';
  const rawChapters = Array.isArray(b.chapters) ? b.chapters : null;

  if (!rawChapters || rawChapters.length === 0) {
    return { ok: false, response: err('validation_failed', 'No chapters to export', 400) };
  }
  if (rawChapters.length > MAX_CHAPTERS) {
    return { ok: false, response: err('validation_failed', `Too many chapters (max ${MAX_CHAPTERS})`, 400) };
  }

  let totalLen = 0;
  const chapters: RawChapter[] = [];
  for (const raw of rawChapters) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const content = typeof r.content === 'string' ? r.content : '';
    totalLen += content.length;
    if (totalLen > MAX_TOTAL_CONTENT) {
      return { ok: false, response: err('validation_failed', 'Manuscript too large to export', 413) };
    }
    chapters.push({ title: typeof r.title === 'string' ? r.title : '', content });
  }

  const options = (b.options ?? {}) as Record<string, unknown>;
  const model = buildManuscriptModel({
    title,
    author: asAuthor(b.author),
    chapters,
    options: { titlePage: options.titlePage !== false },
  });

  if (model.totalWordCount === 0) {
    return { ok: false, response: err('validation_failed', 'Nothing to export — all selected chapters are empty', 400) };
  }

  return { ok: true, model, filenameBase: sanitizeFilename(title || 'manuscript') };
}

/** Build a binary download response from a generated buffer. */
export function downloadResponse(buffer: Buffer, contentType: string, filename: string): NextResponse {
  // Convert to a fresh ArrayBuffer-backed Uint8Array for a clean BodyInit.
  const body = new Uint8Array(buffer);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
