/**
 * MP-05 — Comment highlight geometry.
 *
 * Pure logic for converting absolute plain-text offset ranges (indexing into
 * `getPlainText(chapter.content)` — see `lib/editor/serialization.ts`) into
 * per-text-node segments. The caller walks the live Lexical tree in document
 * order using the SAME join rules as `lexicalJsonToPlaintext` (root children
 * joined with '\n', other elements concatenated, non-text/non-element nodes
 * contribute '') and produces the `HighlightNode[]` input; this module stays
 * editor-free so it can be unit-tested without a live editor.
 */

/** One text node encountered during the document-order walk. */
export interface HighlightNode {
  /** Lexical node key ('' allowed for sentinel entries that only carry joins). */
  key: string;
  /** Plain-text length contributed by this node (`getTextContent().length`). */
  length: number;
  /**
   * Number of plain-text join characters ('\n' between root children) that
   * follow this node before the next node's text begins. Empty top-level
   * blocks contribute no node of their own, so several joins can accumulate
   * here (e.g. "A\n\nB" → node A has joinAfter 2).
   */
  joinAfter: number;
}

/** Absolute half-open range [start, end) into the chapter plain text. */
export interface AbsoluteRange {
  start: number;
  end: number;
}

/** A slice of one text node, with offsets local to that node's text. */
export interface NodeSegment {
  key: string;
  /** Start offset within the node's text. */
  start: number;
  /** End offset (exclusive) within the node's text. */
  end: number;
}

/**
 * Slice absolute plain-text ranges across the walked text nodes.
 *
 * - Offsets falling inside join gaps ('\n' between blocks) are not attributed
 *   to any node — a range spanning two blocks yields one segment per block.
 * - Zero-length (or inverted) ranges yield nothing.
 * - Out-of-bounds offsets are clamped to the document's plain-text length.
 * - Zero-length nodes (sentinels for leading joins) never yield segments.
 */
export function sliceRangesAcrossNodes(
  nodes: HighlightNode[],
  ranges: AbsoluteRange[],
): NodeSegment[] {
  // Absolute start offset of each node, honouring join gaps.
  const starts: number[] = new Array(nodes.length);
  let total = 0;
  for (let i = 0; i < nodes.length; i++) {
    starts[i] = total;
    total += nodes[i].length + nodes[i].joinAfter;
  }

  const segments: NodeSegment[] = [];
  for (const range of ranges) {
    const start = Math.max(0, Math.min(range.start, total));
    const end = Math.max(0, Math.min(range.end, total));
    if (end <= start) continue;

    for (let i = 0; i < nodes.length; i++) {
      const nodeStart = starts[i];
      const nodeEnd = nodeStart + nodes[i].length;
      if (nodeStart >= end) break; // nodes are in document order
      const segStart = Math.max(start, nodeStart);
      const segEnd = Math.min(end, nodeEnd);
      if (segEnd <= segStart) continue; // outside this node / inside a join gap
      segments.push({
        key: nodes[i].key,
        start: segStart - nodeStart,
        end: segEnd - nodeStart,
      });
    }
  }
  return segments;
}
