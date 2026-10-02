import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceAllowsSync } from '@/lib/sync/workspace-owner';
beforeEach(() => localStorage.clear());
describe('browser workspace cloud ownership', () => {
  it('allows the first account and the same account after reload', () => {
    expect(workspaceAllowsSync('user-a')).toBe(true);
    expect(workspaceAllowsSync('user-a')).toBe(true);
  });
  it('does not transfer the existing local workspace to a second account', () => {
    expect(workspaceAllowsSync('user-a')).toBe(true);
    expect(workspaceAllowsSync('user-b')).toBe(false);
    expect(workspaceAllowsSync('user-a')).toBe(true);
  });
});
