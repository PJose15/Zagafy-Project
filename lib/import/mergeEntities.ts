/**
 * CB-11 — non-destructive merge of imported data into an existing entity.
 *
 * When the import review queue flags an extracted item as a duplicate of an
 * entity already in the project, the user can "Merge" instead of accepting a
 * new copy or rejecting. Merging fills in gaps on the existing entity without
 * ever overwriting values the user already has:
 *   - empty string / null / whitespace fields are filled from the patch
 *   - array fields are unioned (case-insensitive for strings; structural for
 *     objects), preserving existing order and appending only new members
 *   - existing non-empty scalar values always win
 */

function isEmptyScalar(v: unknown): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '');
}

function arrayKey(item: unknown): string {
  return typeof item === 'string' ? item.toLowerCase().trim() : JSON.stringify(item);
}

/**
 * Return a copy of `existing` with any empty fields filled from `patch` and any
 * array fields unioned. Never mutates inputs; never overwrites a non-empty
 * scalar the user already has.
 */
export function mergeFill<T extends object>(existing: T, patch: Partial<T>): T {
  const out: Record<string, unknown> = { ...(existing as Record<string, unknown>) };

  for (const [key, incoming] of Object.entries(patch)) {
    if (incoming == null) continue;
    const current = out[key];

    if (Array.isArray(incoming)) {
      const base = Array.isArray(current) ? current : [];
      const seen = new Set(base.map(arrayKey));
      const merged = [...base];
      for (const item of incoming) {
        if (item == null) continue;
        const k = arrayKey(item);
        if (k === '' || seen.has(k)) continue;
        seen.add(k);
        merged.push(item);
      }
      out[key] = merged;
      continue;
    }

    if (isEmptyScalar(current)) {
      out[key] = incoming;
    }
    // else: existing non-empty scalar wins — leave it.
  }

  return out as T;
}

/** Normalize a name/title for duplicate matching (mirrors the review queue). */
export function normalizeForMatch(s: string): string {
  return s.toLowerCase().trim();
}
