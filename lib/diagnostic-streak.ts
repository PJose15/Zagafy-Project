const STORAGE_KEY = 'zagafy_diagnostic_streak';

interface StreakData {
  count: number;
  lastDate: string;
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function readStreak(): StreakData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { count: 0, lastDate: '' };
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.count === 'number' &&
      typeof parsed.lastDate === 'string' &&
      parsed.count >= 0
    ) {
      return parsed as StreakData;
    }
    return { count: 0, lastDate: '' };
  } catch {
    return { count: 0, lastDate: '' };
  }
}

function writeStreak(data: StreakData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded / storage unavailable — best effort, never crash the caller.
  }
}

export function incrementStreak(): number {
  const today = getToday();
  const current = readStreak();

  if (current.lastDate === today) {
    return current.count;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const newCount = current.lastDate === yesterdayStr ? current.count + 1 : 1;
  const newData: StreakData = { count: newCount, lastDate: today };
  writeStreak(newData);
  return newCount;
}

export function getStreak(): number {
  const today = getToday();
  const current = readStreak();

  if (current.lastDate === today) return current.count;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (current.lastDate === yesterdayStr) return current.count;

  return 0;
}

export function resetStreak(): void {
  localStorage.removeItem(STORAGE_KEY);
}
