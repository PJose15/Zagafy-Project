import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defaultState } from '@/lib/store';
import type { ReviewItem } from '@/components/import/ImportReviewQueue';

const mocks = vi.hoisted(() => ({ save: vi.fn(), toast: vi.fn() }));
vi.mock('@/lib/store', async original => ({ ...await original<typeof import('@/lib/store')>(), useStory: () => ({ state: defaultState, saveNow: mocks.save }) }));
vi.mock('@/components/toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/components/import/ImportReviewQueue', () => ({ ImportReviewQueue: ({ onConfirm }: { onConfirm: (items: ReviewItem[]) => void }) => <button onClick={() => onConfirm([{ id: 'review', category: 'chapters', label: 'Imported', subtitle: '', confidence: 1, status: 'accepted', entity: { title: 'Imported', raw_text_reference: 'The keeper found the ledger.', summary: 'A discovery' } }])}>Confirm fixture</button> }));
import ImportPage from '@/app/(app)/import/page';

beforeEach(() => {
  mocks.save.mockReset(); mocks.toast.mockReset();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ extractedData: { project: { title: 'Imported project' } } }) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function review() {
  const { container } = render(<ImportPage />);
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [new File(['The keeper found the ledger.'], 'chapter.txt', { type: 'text/plain' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Start Ingestion' }));
  await screen.findByRole('button', { name: 'Confirm fixture' });
}
it('waits for persistence before reporting success and prevents duplicate commits', async () => {
  let finish!: () => void;
  mocks.save.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  await review();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm fixture' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm fixture' }));
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Ingestion Complete')).toBeNull();
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(mocks.save.mock.calls[0][0]).toMatchObject({ title: 'Imported project', chapters: [{ title: 'Imported', content: 'The keeper found the ledger.' }] });
  await act(async () => finish());
  expect(await screen.findByText('Ingestion Complete')).toBeDefined();
  expect(mocks.toast).toHaveBeenCalledWith(expect.any(String), 'success');
});
it('keeps a failed import available and retries the same IDs and snapshot', async () => {
  mocks.save.mockRejectedValueOnce(new Error('quota')).mockResolvedValueOnce(undefined);
  await review();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm fixture' }));
  const retry = await screen.findByRole('button', { name: 'Retry saving import' });
  expect(screen.queryByText('Ingestion Complete')).toBeNull();
  expect(mocks.toast).toHaveBeenCalledWith(expect.any(String), 'error');
  fireEvent.click(retry);
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
  expect(mocks.save.mock.calls[1][0]).toBe(mocks.save.mock.calls[0][0]);
  expect(await screen.findByText('Ingestion Complete')).toBeDefined();
});
