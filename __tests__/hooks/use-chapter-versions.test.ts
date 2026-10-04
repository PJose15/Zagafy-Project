import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/lib/projects/active-project', () => ({ getActiveProjectId: vi.fn(() => 'project-a') }));

vi.mock('@/lib/types/chapter-version', () => {
  let store: any[] = [];
  return {
    readVersions: vi.fn(async (chapterId: string) => store.filter(v => v.chapterId === chapterId)),
    addVersion: vi.fn(async (chapterId: string, content: string, label: string, source: string, isCanonical: boolean) => {
      const v = {
        id: `v-${store.length}`,
        chapterId,
        content,
        label,
        source,
        isCanonical,
        createdAt: new Date().toISOString(),
        wordCount: content.split(/\s+/).filter(Boolean).length,
      };
      store.push(v);
      return v;
    }),
    setCanonical: vi.fn(async (versionId: string) => {
      for (const v of store) {
        v.isCanonical = v.id === versionId;
      }
    }),
    deleteVersion: vi.fn(async (versionId: string) => {
      store = store.filter(v => v.id !== versionId);
    }),
    renameVersion: vi.fn(async (versionId: string, newLabel: string) => {
      const v = store.find(v2 => v2.id === versionId);
      if (v) v.label = newLabel;
    }),
    ensureInitialVersion: vi.fn(async (chapterId: string, content: string) => {
      if (store.some(v => v.chapterId === chapterId)) return store.filter(v => v.chapterId === chapterId);
      if (!content.trim()) return [];
      const v = {
        id: `v-${store.length}`,
        chapterId,
        content,
        label: 'Version A',
        source: 'auto-snapshot',
        isCanonical: true,
        createdAt: new Date().toISOString(),
        wordCount: content.split(/\s+/).filter(Boolean).length,
      };
      store.push(v);
      return [v];
    }),
    getCanonicalVersion: vi.fn(),
    __resetStore: () => { store = []; },
  };
});

describe('useChapterVersions', () => {
  beforeEach(async () => {
    const mod = await import('@/lib/types/chapter-version') as any;
    mod.__resetStore();
    vi.clearAllMocks();
    const { getActiveProjectId } = await import('@/lib/projects/active-project');
    vi.mocked(getActiveProjectId).mockReturnValue('project-a');
  });

  async function importHook() {
    const { useChapterVersions } = await import('@/hooks/use-chapter-versions');
    return useChapterVersions;
  }

  it('initializes with versions from ensureInitialVersion', async () => {
    const useChapterVersions = await importHook();
    const { result } = renderHook(() => useChapterVersions('ch-1', 'Hello world'));

    await waitFor(() => {
      expect(result.current.versions).toHaveLength(1);
    });
    expect(result.current.versions[0].label).toBe('Version A');
    expect(result.current.versions[0].chapterId).toBe('ch-1');
    expect(result.current.versions[0].isCanonical).toBe(true);
  });

  it('returns versionCount matching versions length', async () => {
    const useChapterVersions = await importHook();
    const { result } = renderHook(() => useChapterVersions('ch-1', 'Some content here'));

    await waitFor(() => {
      expect(result.current.versionCount).toBe(1);
    });
    expect(result.current.versionCount).toBe(result.current.versions.length);
  });

  it('activeVersion returns canonical version', async () => {
    const useChapterVersions = await importHook();
    const { result } = renderHook(() => useChapterVersions('ch-1', 'Some content'));

    await waitFor(() => {
      expect(result.current.activeVersion).not.toBeNull();
    });
    expect(result.current.activeVersion!.isCanonical).toBe(true);
    expect(result.current.activeVersion!.id).toBe(result.current.versions[0].id);
  });

  it('activeVersion returns first version when none is canonical', async () => {
    const mod = await import('@/lib/types/chapter-version') as any;
    mod.__resetStore();
    mod.ensureInitialVersion.mockImplementationOnce(async (chapterId: string, content: string) => {
      const v = {
        id: 'v-non-canonical',
        chapterId,
        content,
        label: 'Draft',
        source: 'manual',
        isCanonical: false,
        createdAt: new Date().toISOString(),
        wordCount: content.split(/\s+/).filter(Boolean).length,
      };
      return [v];
    });

    const useChapterVersions = await importHook();
    const { result } = renderHook(() => useChapterVersions('ch-1', 'Some content'));

    await waitFor(() => {
      expect(result.current.activeVersion).not.toBeNull();
    });
    expect(result.current.activeVersion!.id).toBe('v-non-canonical');
  });

  it('createVersion calls addVersion and refreshes', async () => {
    const mod = await import('@/lib/types/chapter-version') as any;
    const useChapterVersions = await importHook();
    const { result } = renderHook(() => useChapterVersions('ch-1', 'Initial content'));

    await waitFor(() => {
      expect(result.current.versionCount).toBe(1);
    });

    await act(async () => {
      result.current.createVersion('Branch content', 'Version B', 'manual');
    });

    expect(mod.addVersion).toHaveBeenCalledWith('ch-1', 'Branch content', 'Version B', 'manual', false, 'project-a');
    expect(mod.readVersions).toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.versionCount).toBe(2);
    });
  });

  it('switchVersion returns found version', async () => {
    const useChapterVersions = await importHook();
    const { result } = renderHook(() => useChapterVersions('ch-1', 'Some content'));

    await waitFor(() => {
      expect(result.current.versions).toHaveLength(1);
    });

    const versionId = result.current.versions[0].id;
    let found: any;
    act(() => {
      found = result.current.switchVersion(versionId);
    });

    expect(found).not.toBeNull();
    expect(found.id).toBe(versionId);
  });

  it('switchVersion returns null for unknown id', async () => {
    const useChapterVersions = await importHook();
    const { result } = renderHook(() => useChapterVersions('ch-1', 'Some content'));

    await waitFor(() => {
      expect(result.current.versions).toHaveLength(1);
    });

    let found: any;
    act(() => {
      found = result.current.switchVersion('nonexistent-id');
    });

    expect(found).toBeNull();
  });

  it('markCanonical calls setCanonical and refreshes', async () => {
    const mod = await import('@/lib/types/chapter-version') as any;
    const useChapterVersions = await importHook();
    const { result } = renderHook(() => useChapterVersions('ch-1', 'Initial'));

    await waitFor(() => {
      expect(result.current.versionCount).toBe(1);
    });

    await act(async () => {
      result.current.createVersion('Alt content', 'Version B', 'manual');
    });

    await waitFor(() => {
      expect(result.current.versionCount).toBe(2);
    });

    const secondVersionId = result.current.versions[1].id;

    await act(async () => {
      result.current.markCanonical(secondVersionId);
    });

    expect(mod.setCanonical).toHaveBeenCalledWith(secondVersionId, 'project-a');
    expect(mod.readVersions).toHaveBeenCalled();
  });

  it('rename calls renameVersion and refreshes', async () => {
    const mod = await import('@/lib/types/chapter-version') as any;
    const useChapterVersions = await importHook();
    const { result } = renderHook(() => useChapterVersions('ch-1', 'Some content'));

    await waitFor(() => {
      expect(result.current.versions).toHaveLength(1);
    });

    const versionId = result.current.versions[0].id;

    await act(async () => {
      result.current.rename(versionId, 'Renamed Draft');
    });

    expect(mod.renameVersion).toHaveBeenCalledWith(versionId, 'Renamed Draft', 'project-a');
    expect(mod.readVersions).toHaveBeenCalled();
  });

  it('remove calls deleteVersion and refreshes', async () => {
    const mod = await import('@/lib/types/chapter-version') as any;
    const useChapterVersions = await importHook();
    const { result } = renderHook(() => useChapterVersions('ch-1', 'Some content'));

    await waitFor(() => {
      expect(result.current.versionCount).toBe(1);
    });

    await act(async () => {
      result.current.createVersion('Second version', 'Version B', 'manual');
    });

    await waitFor(() => {
      expect(result.current.versionCount).toBe(2);
    });

    const firstId = result.current.versions[0].id;

    await act(async () => {
      result.current.remove(firstId);
    });

    expect(mod.deleteVersion).toHaveBeenCalledWith(firstId, 'project-a');
    expect(mod.readVersions).toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.versionCount).toBe(1);
    });
  });

  it('refresh re-reads versions from storage', async () => {
    const mod = await import('@/lib/types/chapter-version') as any;
    const useChapterVersions = await importHook();
    const { result } = renderHook(() => useChapterVersions('ch-1', 'Some content'));

    await waitFor(() => {
      expect(result.current.versions).toHaveLength(1);
    });

    const callCountBefore = mod.readVersions.mock.calls.length;

    await act(async () => {
      result.current.refresh();
    });

    expect(mod.readVersions.mock.calls.length).toBeGreaterThan(callCountBefore);
    expect(mod.readVersions).toHaveBeenCalledWith('ch-1', 'project-a');
  });

  it('does not re-run ensureInitialVersion on content changes (per-keystroke guard)', async () => {
    const mod = await import('@/lib/types/chapter-version') as any;
    const useChapterVersions = await importHook();
    const { result, rerender } = renderHook(
      ({ content }) => useChapterVersions('ch-1', content),
      { initialProps: { content: 'Hello world' } },
    );

    await waitFor(() => {
      expect(result.current.versions).toHaveLength(1);
    });
    const callsAfterMount = mod.ensureInitialVersion.mock.calls.length;

    // Typing: content changes, chapterId stays — no reload, no re-seed
    rerender({ content: 'Hello world again' });
    rerender({ content: 'Hello world again and again' });

    expect(mod.ensureInitialVersion.mock.calls.length).toBe(callsAfterMount);
  });

  it('re-loads with the latest content when the chapter changes', async () => {
    const mod = await import('@/lib/types/chapter-version') as any;
    const useChapterVersions = await importHook();
    const { result, rerender } = renderHook(
      ({ chapterId, content }) => useChapterVersions(chapterId, content),
      { initialProps: { chapterId: 'ch-1', content: 'First chapter text' } },
    );

    await waitFor(() => {
      expect(result.current.versions).toHaveLength(1);
    });

    // Switch chapters — the ref must carry the CURRENT content for seeding
    rerender({ chapterId: 'ch-2', content: 'Second chapter text' });

    await waitFor(() => {
      expect(mod.ensureInitialVersion).toHaveBeenCalledWith('ch-2', 'Second chapter text', 'project-a');
    });
    await waitFor(() => {
      expect(result.current.versions[0]?.chapterId).toBe('ch-2');
    });
  });

  it('reports initial storage failures without an unhandled rejection', async () => {
    const mod = await import('@/lib/types/chapter-version');
    vi.mocked(mod.ensureInitialVersion).mockRejectedValueOnce(new Error('unavailable'));
    const useChapterVersions = await importHook();
    const { result } = renderHook(() => useChapterVersions('ch-1', 'Current text'));
    await waitFor(() => expect(result.current.error).toBe('load'));
    expect(result.current.versions).toEqual([]);
  });

  it('failed saves return false and retain the loaded history; retry succeeds', async () => {
    const mod = await import('@/lib/types/chapter-version');
    const useChapterVersions = await importHook();
    const { result } = renderHook(() => useChapterVersions('ch-1', 'Initial'));
    await waitFor(() => expect(result.current.versionCount).toBe(1));
    vi.mocked(mod.addVersion).mockRejectedValueOnce(new Error('QuotaExceededError'));
    await act(async () => { expect(await result.current.createVersion('unsaved', 'Draft', 'manual')).toBe(false); });
    expect(result.current.versionCount).toBe(1);
    expect(result.current.error).toBe('save');
    await act(async () => { expect(await result.current.createVersion('unsaved', 'Draft', 'manual')).toBe(true); });
    expect(result.current.versionCount).toBe(2);
    expect(result.current.error).toBeNull();
  });

  it('late saves from a previous chapter cannot replace the current history', async () => {
    const mod = await import('@/lib/types/chapter-version');
    const useChapterVersions = await importHook();
    const { result, rerender } = renderHook(({ id }) => useChapterVersions(id, 'Initial'), { initialProps: { id: 'ch-1' } });
    await waitFor(() => expect(result.current.versionCount).toBe(1));
    let resolve!: (value: never) => void;
    vi.mocked(mod.addVersion).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.createVersion('old chapter edit', 'Draft', 'manual'); });
    rerender({ id: 'ch-2' });
    await waitFor(() => expect(result.current.versions[0]?.chapterId).toBe('ch-2'));
    await act(async () => { resolve(undefined as never); expect(await pending).toBe(false); });
    expect(result.current.versions[0]?.chapterId).toBe('ch-2');
  });

  it('keeps in-flight mutations scoped to their original project during a project switch', async () => {
    const mod = await import('@/lib/types/chapter-version');
    const { getActiveProjectId } = await import('@/lib/projects/active-project');
    const useChapterVersions = await importHook();
    const { result, rerender } = renderHook(() => useChapterVersions('shared-chapter-id', 'Initial'));
    await waitFor(() => expect(result.current.versionCount).toBe(1));
    let resolve!: (value: never) => void;
    vi.mocked(mod.addVersion).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    let pending!: Promise<boolean>;
    act(() => { pending = result.current.createVersion('old project edit', 'Draft', 'manual'); });
    vi.mocked(getActiveProjectId).mockReturnValue('project-b');
    rerender();
    await waitFor(() => expect(mod.ensureInitialVersion).toHaveBeenCalledWith('shared-chapter-id', 'Initial', 'project-b'));
    await act(async () => { resolve(undefined as never); expect(await pending).toBe(false); });
    expect(mod.addVersion).toHaveBeenCalledWith('shared-chapter-id', 'old project edit', 'Draft', 'manual', false, 'project-a');
    expect(mod.readVersions).toHaveBeenCalledWith('shared-chapter-id', 'project-a');
    expect(result.current.error).toBeNull();
  });

  it('returns null activeVersion when no versions exist (empty content)', async () => {
    const useChapterVersions = await importHook();
    const { result } = renderHook(() => useChapterVersions('ch-1', ''));

    await waitFor(() => {
      expect(result.current.versions).toHaveLength(0);
    });
    expect(result.current.activeVersion).toBeNull();
    expect(result.current.versionCount).toBe(0);
  });
});
