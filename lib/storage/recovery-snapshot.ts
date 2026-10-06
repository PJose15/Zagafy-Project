/** Automatic recovery copies must survive ordinary snapshot caps and remain
 * local until the author deliberately restores/copies their contents. Names
 * recognize backups created before the explicit marker was introduced. */
export function isRecoverySnapshot(row: { recoveryProtected?: boolean; name: string }): boolean {
  return row.recoveryProtected === true || [
    'Sync conflict backup (local edit)', 'Cloud deletion recovery (local only)', 'Unsaved text recovery (local only)',
  ].includes(row.name);
}
