/**
 * MP-05 — Margin comments anchored to manuscript text.
 *
 * Offsets index into `getPlainText(chapter.content)` (see
 * `lib/editor/serialization.ts`). The quote plus prefix/suffix context
 * snapshots let a comment re-anchor after the chapter text is edited.
 */

export interface CommentReply {
  id: string;
  text: string;
  createdAt: string; // ISO
}

export interface ManuscriptComment {
  id: string;
  projectId: string;
  chapterId: string;
  /** Start offset into getPlainText(chapter.content). */
  startOffset: number;
  /** End offset (exclusive) into getPlainText(chapter.content). */
  endOffset: number;
  /** Snapshot of the anchored text at comment time. */
  quote: string;
  /** Up to 30 chars of context before the quote — re-anchoring tiebreaker. */
  prefix: string;
  /** Up to 30 chars of context after the quote — re-anchoring tiebreaker. */
  suffix: string;
  text: string;
  replies: CommentReply[];
  resolved: boolean;
  /** True when the quoted text can no longer be found in the chapter. */
  orphaned: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

/** Selection payload emitted by the manuscript editor for comment creation. */
export interface CommentSelection {
  start: number;
  end: number;
  quote: string;
  prefix: string;
  suffix: string;
}

/** Context window captured around an anchor for re-anchoring disambiguation. */
export const COMMENT_ANCHOR_CONTEXT = 30;
