export type DiffType = 'equal' | 'added' | 'removed';

export interface DiffSegment {
  type: DiffType;
  text: string;
}

// An LCS table larger than this many cells (~tens of MB and seconds of blocking
// main-thread work) risks freezing or OOM-ing the tab. Two long chapter versions
// can each be ~10k word-tokens → a ~100M-cell matrix. Above this bound we fall
// back to a coarser diff instead of allocating an m×n matrix.
const MAX_MATRIX_CELLS = 2_000_000;

/**
 * LCS diff over a token array. Assumes the common prefix/suffix have already
 * been stripped by the caller, and that `old.length * next.length` is within
 * MAX_MATRIX_CELLS. Returns segments whose `text` is the joined tokens.
 */
function lcsDiff(oldTokens: string[], newTokens: string[]): DiffSegment[] {
  const m = oldTokens.length;
  const n = newTokens.length;

  // Full LCS table (bounded by MAX_MATRIX_CELLS at the call site). Uint32Array
  // rows keep memory to 4 bytes/cell.
  const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));

  for (let i = 1; i <= m; i++) {
    const row = dp[i]!;
    const prev = dp[i - 1]!;
    const oldTok = oldTokens[i - 1];
    for (let j = 1; j <= n; j++) {
      if (oldTok === newTokens[j - 1]) {
        row[j] = prev[j - 1]! + 1;
      } else {
        row[j] = Math.max(prev[j]!, row[j - 1]!);
      }
    }
  }

  const segments: DiffSegment[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      segments.push({ type: 'equal', text: oldTokens[i - 1]! });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      segments.push({ type: 'added', text: newTokens[j - 1]! });
      j--;
    } else {
      segments.push({ type: 'removed', text: oldTokens[i - 1]! });
      i--;
    }
  }
  segments.reverse();
  return segments;
}

/** Coalesce consecutive same-type segments into one. */
function mergeSegments(segments: DiffSegment[]): DiffSegment[] {
  const result: DiffSegment[] = [];
  for (const seg of segments) {
    if (!seg.text) continue;
    const last = result[result.length - 1];
    if (last && last.type === seg.type) {
      last.text += seg.text;
    } else {
      result.push({ ...seg });
    }
  }
  return result;
}

/**
 * Word-level diff using LCS (Longest Common Subsequence). No external deps.
 *
 * Guards against pathological memory/CPU use on large inputs by (1) stripping the
 * common prefix/suffix so only the changed region is diffed, and (2) falling back
 * to a line-level diff — and finally a whole-block replace — when the changed
 * region is still too large to diff at word granularity within MAX_MATRIX_CELLS.
 */
export function diffWords(oldText: string, newText: string): DiffSegment[] {
  if (oldText === newText) {
    return oldText ? [{ type: 'equal', text: oldText }] : [];
  }
  if (!oldText) return newText ? [{ type: 'added', text: newText }] : [];
  if (!newText) return [{ type: 'removed', text: oldText }];

  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);

  // Strip the identical head and tail so the expensive diff only runs on the
  // region that actually changed — the common case is editing a small part of a
  // long chapter, which collapses the matrix to a fraction of its full size.
  let prefix = 0;
  const maxPrefix = Math.min(oldWords.length, newWords.length);
  while (prefix < maxPrefix && oldWords[prefix] === newWords[prefix]) prefix++;

  let suffix = 0;
  const maxSuffix = Math.min(oldWords.length, newWords.length) - prefix;
  while (
    suffix < maxSuffix &&
    oldWords[oldWords.length - 1 - suffix] === newWords[newWords.length - 1 - suffix]
  ) {
    suffix++;
  }

  const oldMiddle = oldWords.slice(prefix, oldWords.length - suffix);
  const newMiddle = newWords.slice(prefix, newWords.length - suffix);

  const head = prefix > 0 ? oldWords.slice(0, prefix).join('') : '';
  const tail = suffix > 0 ? oldWords.slice(oldWords.length - suffix).join('') : '';

  let middle: DiffSegment[];
  if (oldMiddle.length * newMiddle.length <= MAX_MATRIX_CELLS) {
    middle = lcsDiff(oldMiddle, newMiddle);
  } else {
    // Too large for a word-level matrix. Diff at line granularity (far fewer
    // tokens); if even that is too large, replace the whole changed block.
    const oldLines = oldMiddle.join('').split(/(\n)/);
    const newLines = newMiddle.join('').split(/(\n)/);
    if (oldLines.length * newLines.length <= MAX_MATRIX_CELLS) {
      middle = lcsDiff(oldLines, newLines);
    } else {
      middle = [
        { type: 'removed', text: oldMiddle.join('') },
        { type: 'added', text: newMiddle.join('') },
      ];
    }
  }

  return mergeSegments([
    { type: 'equal', text: head },
    ...middle,
    { type: 'equal', text: tail },
  ]);
}
