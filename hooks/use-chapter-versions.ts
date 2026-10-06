'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { getActiveProjectId } from '@/lib/projects/active-project';
import { readVersions, addVersion, setCanonical, deleteVersion, renameVersion, ensureInitialVersion } from '@/lib/types/chapter-version';
import type { ChapterVersion, VersionSource } from '@/lib/types/chapter-version';

export function useChapterVersions(chapterId: string, currentContent: string) {
  const projectId = getActiveProjectId();
  const scope = JSON.stringify([projectId, chapterId]);
  const [history, setHistory] = useState<{ scope: string; items: ChapterVersion[] }>({ scope, items: [] });
  const [failure, setFailure] = useState<{ scope: string; value: 'load' | 'save' } | null>(null);
  const versions = useMemo(() => history.scope === scope ? history.items : [], [history, scope]);
  const error = failure?.scope === scope ? failure.value : null;
  const contentRef = useRef(currentContent);
  const generation = useRef(0);
  const request = useRef(0);
  useEffect(() => { contentRef.current = currentContent; }, [currentContent]);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    const currentRequest = ++request.current;
    ensureInitialVersion(chapterId, contentRef.current, projectId).then(value => {
      if (generation.current === currentGeneration && request.current === currentRequest) {
        setHistory({ scope, items: value });
        setFailure(null);
      }
    }).catch(() => {
      if (generation.current === currentGeneration && request.current === currentRequest) {
        setFailure({ scope, value: 'load' });
      }
    });
    return () => { generation.current = currentGeneration + 1; };
  }, [chapterId, projectId, scope]);

  // A request started in an old chapter/project must never update the new UI.
  const run = useCallback(async (operation?: () => Promise<unknown>): Promise<boolean> => {
    const currentGeneration = generation.current;
    const currentRequest = ++request.current;
    try {
      if (operation) await operation();
      const value = await readVersions(chapterId, projectId);
      if (generation.current !== currentGeneration) return false;
      if (request.current === currentRequest) {
        setHistory({ scope, items: value });
        setFailure(null);
      }
      return true;
    } catch {
      if (generation.current === currentGeneration && request.current === currentRequest) {
        setFailure({ scope, value: 'save' });
      }
      return false;
    }
  }, [chapterId, projectId, scope]);

  const activeVersion = useMemo(() => versions.find(v => v.isCanonical) ?? versions[0] ?? null, [versions]);
  const refresh = useCallback(() => run(), [run]);
  const createVersion = useCallback((content: string, label: string, source: VersionSource) =>
    run(() => addVersion(chapterId, content, label, source, false, projectId)), [run, chapterId, projectId]);
  const switchVersion = useCallback((id: string) => versions.find(v => v.id === id) ?? null, [versions]);
  const markCanonical = useCallback((id: string) => run(() => setCanonical(id, projectId)), [run, projectId]);
  const rename = useCallback((id: string, label: string) => run(() => renameVersion(id, label, projectId)), [run, projectId]);
  const remove = useCallback((id: string) => run(() => deleteVersion(id, projectId)), [run, projectId]);
  return { versions, activeVersion, createVersion, switchVersion, markCanonical, rename, remove, refresh, error, versionCount: versions.length };
}
