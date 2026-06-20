import type { HeteronymVoice } from '@/lib/heteronym-voice';
import { getActiveProjectId } from '@/lib/projects/active-project';

export type { HeteronymVoice };

// Heteronyms (alter egos) are scoped PER PROJECT — each project keeps its own
// personas + active voice, so they don't bleed across projects. Keys are
// suffixed with the active project id.
const HETERONYMS_PREFIX = 'zagafy_heteronyms';
const ACTIVE_PREFIX = 'zagafy_active_heteronym';
const GUEST_PREFIX = 'zagafy_guest_heteronym';

// Legacy (pre-multi-project) global keys — migrated onto the active project once.
const LEGACY_HETERONYMS_KEY = 'zagafy_heteronyms';
const LEGACY_ACTIVE_KEY = 'zagafy_active_heteronym';
const LEGACY_INITIALIZED_KEY = 'zagafy_heteronyms_initialized';

function hetKey(pid: string = getActiveProjectId()): string { return `${HETERONYMS_PREFIX}_${pid}`; }
function activeKey(pid: string = getActiveProjectId()): string { return `${ACTIVE_PREFIX}_${pid}`; }
function guestKey(pid: string = getActiveProjectId()): string { return `${GUEST_PREFIX}_${pid}`; }

/**
 * One-time migration: move the legacy GLOBAL heteronyms onto the active project
 * the first time it reads, then delete the legacy keys so other projects start
 * fresh (no cross-project bleed).
 */
function migrateLegacy(pid: string): void {
  try {
    if (localStorage.getItem(hetKey(pid)) !== null) return; // already scoped
    const legacy = localStorage.getItem(LEGACY_HETERONYMS_KEY);
    if (legacy === null) return;
    localStorage.setItem(hetKey(pid), legacy);
    const legacyActive = localStorage.getItem(LEGACY_ACTIVE_KEY);
    if (legacyActive) localStorage.setItem(activeKey(pid), legacyActive);
    localStorage.removeItem(LEGACY_HETERONYMS_KEY);
    localStorage.removeItem(LEGACY_ACTIVE_KEY);
    localStorage.removeItem(LEGACY_INITIALIZED_KEY);
  } catch {
    // best effort
  }
}

const MAX_HETERONYMS = 10;
const DEFAULT_COLOR = '#6366f1'; // indigo-500

export interface Heteronym {
  id: string;
  name: string;
  bio: string;
  styleNote: string;
  avatarColor: string;
  avatarEmoji: string;
  createdAt: string;
  isDefault: boolean;
  voice?: HeteronymVoice;
}

function isHeteronym(v: unknown): v is Heteronym {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.bio === 'string' &&
    typeof o.styleNote === 'string' &&
    typeof o.avatarColor === 'string' &&
    typeof o.avatarEmoji === 'string' &&
    typeof o.createdAt === 'string' &&
    typeof o.isDefault === 'boolean'
  );
}

export function readHeteronyms(): Heteronym[] {
  try {
    const pid = getActiveProjectId();
    migrateLegacy(pid);
    const raw = localStorage.getItem(hetKey(pid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHeteronym);
  } catch {
    return [];
  }
}

export function writeHeteronyms(heteronyms: Heteronym[]): void {
  try {
    localStorage.setItem(hetKey(), JSON.stringify(heteronyms));
  } catch {
    // Storage quota exceeded
  }
}

export function addHeteronym(heteronym: Heteronym): boolean {
  const existing = readHeteronyms();
  if (existing.length >= MAX_HETERONYMS) return false;
  existing.push(heteronym);
  writeHeteronyms(existing);
  return true;
}

export function updateHeteronym(id: string, updates: Partial<Omit<Heteronym, 'id' | 'createdAt' | 'isDefault'>>): void {
  const heteronyms = readHeteronyms();
  const idx = heteronyms.findIndex(h => h.id === id);
  if (idx === -1) return;
  heteronyms[idx] = { ...heteronyms[idx], ...updates };
  writeHeteronyms(heteronyms);
}

export function deleteHeteronym(id: string): void {
  const heteronyms = readHeteronyms();
  const target = heteronyms.find(h => h.id === id);
  if (!target || target.isDefault) return;
  writeHeteronyms(heteronyms.filter(h => h.id !== id));

  // If the deleted heteronym was active, switch to default
  const activeId = getActiveHeteronymId();
  if (activeId === id) {
    const defaultH = heteronyms.find(h => h.isDefault);
    if (defaultH) setActiveHeteronymId(defaultH.id);
  }
}

export function initializeDefaultHeteronym(displayName?: string): Heteronym[] {
  const existing = readHeteronyms();
  if (existing.length > 0) return existing;

  const defaultHeteronym: Heteronym = {
    id: crypto.randomUUID(),
    name: displayName || 'Myself',
    bio: 'My original writing voice',
    styleNote: '',
    avatarColor: DEFAULT_COLOR,
    avatarEmoji: '✍️',
    createdAt: new Date().toISOString(),
    isDefault: true,
  };

  const heteronyms = [defaultHeteronym];
  writeHeteronyms(heteronyms);
  setActiveHeteronymId(defaultHeteronym.id);

  return heteronyms;
}

export function getActiveHeteronymId(): string | null {
  try {
    return localStorage.getItem(activeKey());
  } catch {
    return null;
  }
}

export function setActiveHeteronymId(id: string): void {
  try {
    localStorage.setItem(activeKey(), id);
  } catch {
    // best effort
  }
}

export function getGuestHeteronymId(): string | null {
  try {
    return sessionStorage.getItem(guestKey());
  } catch {
    return null;
  }
}

export function setGuestHeteronymId(id: string | null): void {
  try {
    if (id === null) {
      sessionStorage.removeItem(guestKey());
    } else {
      sessionStorage.setItem(guestKey(), id);
    }
  } catch {
    // best effort
  }
}

/**
 * Subscribe to heteronym changes from other tabs via the `storage` event.
 * Returns an unsubscribe function. Call in useEffect cleanup.
 */
export function onHeteronymChange(callback: (heteronyms: Heteronym[]) => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key === hetKey()) {
      callback(readHeteronyms());
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

export function isAtLimit(): boolean {
  return readHeteronyms().length >= MAX_HETERONYMS;
}

export function getDefaultHeteronym(): Heteronym | undefined {
  return readHeteronyms().find(h => h.isDefault);
}
