/**
 * MP-05 — Comment CRUD (Dexie-backed) + pure re-anchoring logic.
 *
 * All CRUD helpers are scoped to the active project like the other storage
 * helpers. Re-anchoring is pure and unit-testable: given a comment and the
 * chapter's current plain text, it recomputes offsets or marks the comment
 * orphaned when its quoted text no longer exists.
 */

import { db } from '@/lib/storage/dexie-db';
import { getActiveProjectId } from '@/lib/projects/active-project';
import type { CommentReply, ManuscriptComment } from '@/lib/types/comment';

export type { CommentReply, ManuscriptComment } from '@/lib/types/comment';

// ─── CRUD ───

export interface NewCommentInput {
  chapterId: string;
  startOffset: number;
  endOffset: number;
  quote: string;
  prefix: string;
  suffix: string;
  text: string;
}

export async function addComment(
  input: NewCommentInput,
  projectId: string = getActiveProjectId(),
): Promise<ManuscriptComment> {
  const now = new Date().toISOString();
  const comment: ManuscriptComment = {
    id: crypto.randomUUID(),
    projectId,
    chapterId: input.chapterId,
    startOffset: input.startOffset,
    endOffset: input.endOffset,
    quote: input.quote,
    prefix: input.prefix,
    suffix: input.suffix,
    text: input.text,
    replies: [],
    resolved: false,
    orphaned: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.comments.put(comment);
  return comment;
}

/** All comments for one chapter in the given project, oldest first. */
export async function listComments(
  chapterId: string,
  projectId: string = getActiveProjectId(),
): Promise<ManuscriptComment[]> {
  const rows = await db.comments.where('chapterId').equals(chapterId).toArray();
  return rows
    .filter((c) => c.projectId === projectId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Orphaned comments for one chapter (recovery-tray contents). */
export async function listOrphaned(
  chapterId: string,
  projectId: string = getActiveProjectId(),
): Promise<ManuscriptComment[]> {
  const all = await listComments(chapterId, projectId);
  return all.filter((c) => c.orphaned);
}

export async function updateCommentText(id: string, text: string): Promise<void> {
  await db.comments.update(id, { text, updatedAt: new Date().toISOString() });
}

export async function deleteComment(id: string): Promise<void> {
  await db.comments.delete(id);
}

export async function addReply(id: string, text: string): Promise<CommentReply | null> {
  const existing = await db.comments.get(id);
  if (!existing) return null;
  const reply: CommentReply = {
    id: crypto.randomUUID(),
    text,
    createdAt: new Date().toISOString(),
  };
  await db.comments.update(id, {
    replies: [...existing.replies, reply],
    updatedAt: new Date().toISOString(),
  });
  return reply;
}

export async function setResolved(id: string, resolved: boolean): Promise<void> {
  await db.comments.update(id, { resolved, updatedAt: new Date().toISOString() });
}

/** Bulk-persist comments (used after re-anchoring updates offsets/orphan flags). */
export async function putComments(comments: ManuscriptComment[]): Promise<void> {
  if (comments.length === 0) return;
  await db.comments.bulkPut(comments);
}

// ─── Pure re-anchoring ───

/**
 * Recompute a comment's anchor against the chapter's current plain text.
 *
 * 1. If the text at the stored offsets still equals the quote → unchanged
 *    (clearing a stale orphan flag if the text came back, e.g. via undo).
 * 2. Otherwise find every occurrence of the quote. One → re-anchor to it.
 *    Several → score each candidate by how well the surrounding text matches
 *    the stored prefix/suffix (ties broken by proximity to the old offset).
 * 3. Zero occurrences → mark orphaned, keeping the old offsets and quote so
 *    the recovery tray can still show what the comment referred to.
 *
 * Returns the SAME object when nothing changed, so callers can diff by
 * reference to decide what to persist.
 */
export function reanchorComment(
  comment: ManuscriptComment,
  plainText: string,
): ManuscriptComment {
  const { quote, startOffset, endOffset } = comment;

  // Degenerate anchor — nothing to match against.
  if (quote.length === 0) {
    return comment.orphaned ? comment : { ...comment, orphaned: true, updatedAt: new Date().toISOString() };
  }

  // 1. Anchor still intact at the stored offsets.
  if (plainText.slice(startOffset, endOffset) === quote) {
    if (!comment.orphaned) return comment;
    return { ...comment, orphaned: false, updatedAt: new Date().toISOString() };
  }

  // 2. Find all occurrences of the quote.
  const occurrences: number[] = [];
  let idx = plainText.indexOf(quote);
  while (idx !== -1) {
    occurrences.push(idx);
    idx = plainText.indexOf(quote, idx + 1);
  }

  // 3. Gone → orphan (keep old offsets/quote for the tray).
  if (occurrences.length === 0) {
    return comment.orphaned ? comment : { ...comment, orphaned: true, updatedAt: new Date().toISOString() };
  }

  let best = occurrences[0];
  if (occurrences.length > 1) {
    let bestScore = -1;
    for (const occ of occurrences) {
      const score = scoreCandidate(comment, plainText, occ);
      if (
        score > bestScore ||
        (score === bestScore && Math.abs(occ - startOffset) < Math.abs(best - startOffset))
      ) {
        bestScore = score;
        best = occ;
      }
    }
  }

  return {
    ...comment,
    startOffset: best,
    endOffset: best + quote.length,
    orphaned: false,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Score one candidate occurrence: count how many characters of the stored
 * prefix match backwards from the occurrence, plus how many characters of the
 * stored suffix match forwards after it.
 */
function scoreCandidate(
  comment: ManuscriptComment,
  plainText: string,
  occurrence: number,
): number {
  const { prefix, suffix, quote } = comment;
  let score = 0;

  const actualPrefix = plainText.slice(Math.max(0, occurrence - prefix.length), occurrence);
  for (let i = 0; i < Math.min(prefix.length, actualPrefix.length); i++) {
    if (prefix[prefix.length - 1 - i] !== actualPrefix[actualPrefix.length - 1 - i]) break;
    score++;
  }

  const after = occurrence + quote.length;
  const actualSuffix = plainText.slice(after, after + suffix.length);
  for (let i = 0; i < Math.min(suffix.length, actualSuffix.length); i++) {
    if (suffix[i] !== actualSuffix[i]) break;
    score++;
  }

  return score;
}

/**
 * Re-anchor a batch of comments. Returns the updated list plus the subset
 * that actually changed (new object references) for persistence.
 */
export function reanchorAll(
  comments: ManuscriptComment[],
  plainText: string,
): { comments: ManuscriptComment[]; changed: ManuscriptComment[] } {
  const changed: ManuscriptComment[] = [];
  const updated = comments.map((c) => {
    const next = reanchorComment(c, plainText);
    if (next !== c) changed.push(next);
    return next;
  });
  return { comments: updated, changed };
}
