import { describe, it, expect, beforeEach, vi } from 'vitest';

const originalEnv = { ...process.env };

// Mock the email module (also avoids importing 'server-only' from lib/email).
const mockSendEmail = vi.fn().mockResolvedValue(true);
const mockIsEmailConfigured = vi.fn(() => true);
vi.mock('@/lib/email', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  isEmailConfigured: () => mockIsEmailConfigured(),
}));

// Mock DB.
// Candidate query: select(...).from(...).where(...).limit()
const mockSelectLimit = vi.fn().mockResolvedValue([]);
const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

// Atomic stage claim: update(...).set(...).where(...).returning()
const mockUpdateReturning = vi.fn().mockResolvedValue([{ id: 'user_1' }]);
const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }));
const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

vi.mock('@/db/client', () => ({
  db: vi.fn(() => ({ select: mockSelect, update: mockUpdate })),
  isDatabaseConfigured: vi.fn(() => true),
}));

vi.mock('@/db/schema', () => ({
  users: {
    id: 'id',
    email: 'email',
    name: 'name',
    createdAt: 'created_at',
    onboardingStage: 'onboarding_stage',
  },
}));

import { stageForAccountAge, runOnboardingDrip, BATCH_LIMIT } from '@/lib/onboarding-emails';

const NOW = new Date('2026-07-09T09:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

function makeUser(overrides: Partial<{
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  onboardingStage: number;
}> = {}) {
  return {
    id: 'user_1',
    email: 'writer@example.com',
    name: 'Ada',
    createdAt: daysAgo(1.5),
    onboardingStage: 0,
    ...overrides,
  };
}

describe('stageForAccountAge', () => {
  it('returns 0 for accounts younger than 1 day', () => {
    expect(stageForAccountAge(daysAgo(0), NOW)).toBe(0);
    expect(stageForAccountAge(daysAgo(0.9), NOW)).toBe(0);
  });

  it('returns 1 at exactly 1 day', () => {
    expect(stageForAccountAge(daysAgo(1), NOW)).toBe(1);
  });

  it('returns 1 between 1 and 3 days', () => {
    expect(stageForAccountAge(daysAgo(2.9), NOW)).toBe(1);
  });

  it('returns 3 at exactly 3 days', () => {
    expect(stageForAccountAge(daysAgo(3), NOW)).toBe(3);
  });

  it('returns 3 just under 7 days', () => {
    expect(stageForAccountAge(daysAgo(6.9), NOW)).toBe(3);
  });

  it('returns 7 at exactly 7 days and beyond', () => {
    expect(stageForAccountAge(daysAgo(7), NOW)).toBe(7);
    expect(stageForAccountAge(daysAgo(30), NOW)).toBe(7);
  });
});

describe('runOnboardingDrip', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, DATABASE_URL: 'postgresql://test' };
    mockIsEmailConfigured.mockClear().mockReturnValue(true);
    mockSendEmail.mockClear().mockResolvedValue(true);
    mockSelectLimit.mockReset().mockResolvedValue([]);
    mockUpdate.mockClear();
    mockUpdateSet.mockClear();
    mockUpdateWhere.mockClear();
    mockUpdateReturning.mockReset().mockResolvedValue([{ id: 'user_1' }]);
  });

  it('sends onboarding_day1 for a user 1+ days old at stage 0 and advances the stage', async () => {
    mockSelectLimit.mockResolvedValue([makeUser()]);

    const counts = await runOnboardingDrip(NOW);

    expect(counts).toEqual({ examined: 1, sent: 1, skipped: 0 });
    // Stage claimed via update-then-send
    expect(mockUpdateSet).toHaveBeenCalledWith({ onboardingStage: 1 });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'writer@example.com',
        template: 'onboarding_day1',
        data: expect.objectContaining({ name: 'Ada' }),
      }),
    );
  });

  it('sends the day-3 and day-7 templates for older accounts', async () => {
    mockSelectLimit.mockResolvedValue([
      makeUser({ id: 'u3', createdAt: daysAgo(4), onboardingStage: 1 }),
      makeUser({ id: 'u7', createdAt: daysAgo(10), onboardingStage: 3 }),
    ]);

    const counts = await runOnboardingDrip(NOW);

    expect(counts).toEqual({ examined: 2, sent: 2, skipped: 0 });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'onboarding_day3' }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'onboarding_day7' }),
    );
  });

  it('skips users whose due stage is not above their current stage', async () => {
    // 2 days old, already got day 1 → nothing due.
    mockSelectLimit.mockResolvedValue([makeUser({ createdAt: daysAgo(2), onboardingStage: 1 })]);

    const counts = await runOnboardingDrip(NOW);

    expect(counts).toEqual({ examined: 1, sent: 0, skipped: 1 });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('does not send when the atomic claim returns no row (already claimed elsewhere)', async () => {
    mockSelectLimit.mockResolvedValue([makeUser()]);
    mockUpdateReturning.mockResolvedValue([]); // concurrent run won the claim

    const counts = await runOnboardingDrip(NOW);

    expect(counts).toEqual({ examined: 1, sent: 0, skipped: 1 });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('does NOT advance any stage when email is unconfigured (sendEmail would return false)', async () => {
    mockIsEmailConfigured.mockReturnValue(false);
    mockSendEmail.mockResolvedValue(false);
    mockSelectLimit.mockResolvedValue([makeUser()]);

    const counts = await runOnboardingDrip(NOW);

    expect(counts).toEqual({ examined: 0, sent: 0, skipped: 0 });
    expect(mockUpdate).not.toHaveBeenCalled(); // no stage advanced
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('counts a failed send (email configured, Resend error) as skipped, not sent', async () => {
    mockSendEmail.mockResolvedValue(false);
    mockSelectLimit.mockResolvedValue([makeUser()]);

    const counts = await runOnboardingDrip(NOW);

    // Update-then-send: stage was claimed, but the email did not go out.
    expect(counts).toEqual({ examined: 1, sent: 0, skipped: 1 });
  });

  it('exposes a batch cap of 200 and passes it to the query limit', async () => {
    expect(BATCH_LIMIT).toBe(200);
    mockSelectLimit.mockResolvedValue([]);

    await runOnboardingDrip(NOW);

    expect(mockSelectLimit).toHaveBeenCalledWith(200);
  });
});
