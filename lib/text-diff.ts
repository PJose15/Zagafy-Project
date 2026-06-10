export type DiffType = 'equal' | 'added' | 'removed';

export interface DiffSegment {
  type: DiffType;
  text: string;
}

/**
 * Word-level diff using LCS (Longest Common Subsequence).
 * Returns an array of segments marked as equal, added, or removed.
 * No external dependencies.
 */
export function diffWords(oldText: string, newText: string): DiffSegment[] {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);

  if (oldText === newText) {
    return oldText ? [{ type: 'equal', text: oldText }] : [];
  }
  if (!oldText) return newText ? [{ type: 'added', text: newText }] : [];
  if (!newText) return [{ type: 'removed', text: oldText }];

  // Build LCS table
  const m = oldWords.length;
  const n = newWords.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const result: DiffSegment[] = [];
  let i = m, j = n;

  const segments: DiffSegment[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      segments.push({ type: 'equal', text: oldWords[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      segments.push({ type: 'added', text: newWords[j - 1] });
      j--;
    } else {
      segments.push({ type: 'removed', text: oldWords[i - 1] });
      i--;
    }
  }

  segments.reverse();

  // Merge consecutive same-type segments
  for (const seg of segments) {
    const last = result[result.length - 1];
    if (last && last.type === seg.type) {
      last.text += seg.text;
    } else {
      result.push({ ...seg });
    }
  }

  return result;
}
