import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/storage/dexie-db';
import {
  addComment,
  listComments,
  listOrphaned,
  updateCommentText,
  deleteComment,
  addReply,
  setResolved,
  putComments,
} from '@/lib/comments/comments';

const baseInput = {
  chapterId: 'ch1',
  startOffset: 4,
  endOffset: 8,
  quote: 'rain',
  prefix: 'The ',
  suffix: ' fell',
  text: 'Nice imagery',
};

describe('comments CRUD', () => {
  beforeEach(async () => {
    await db.comments.clear();
  });

  it('adds and lists comments for a chapter', async () => {
    const created = await addComment(baseInput, 'p1');
    expect(created.id).toBeTruthy();
    expect(created.resolved).toBe(false);
    expect(created.orphaned).toBe(false);
    expect(created.replies).toEqual([]);

    const listed = await listComments('ch1', 'p1');
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ quote: 'rain', text: 'Nice imagery', chapterId: 'ch1' });
  });

  it('scopes listing to the given project', async () => {
    await addComment(baseInput, 'p1');
    await addComment({ ...baseInput, text: 'Other project' }, 'p2');

    const p1 = await listComments('ch1', 'p1');
    const p2 = await listComments('ch1', 'p2');
    expect(p1).toHaveLength(1);
    expect(p1[0].text).toBe('Nice imagery');
    expect(p2).toHaveLength(1);
    expect(p2[0].text).toBe('Other project');
  });

  it('scopes listing to the given chapter', async () => {
    await addComment(baseInput, 'p1');
    await addComment({ ...baseInput, chapterId: 'ch2' }, 'p1');
    expect(await listComments('ch1', 'p1')).toHaveLength(1);
    expect(await listComments('ch2', 'p1')).toHaveLength(1);
  });

  it('updates comment text', async () => {
    const created = await addComment(baseInput, 'p1');
    await updateCommentText(created.id, 'Edited note');
    const [row] = await listComments('ch1', 'p1');
    expect(row.text).toBe('Edited note');
    expect(row.updatedAt >= created.updatedAt).toBe(true);
  });

  it('adds replies', async () => {
    const created = await addComment(baseInput, 'p1');
    const r1 = await addReply(created.id, 'First reply');
    const r2 = await addReply(created.id, 'Second reply');
    expect(r1?.text).toBe('First reply');
    expect(r2?.text).toBe('Second reply');

    const [row] = await listComments('ch1', 'p1');
    expect(row.replies.map((r) => r.text)).toEqual(['First reply', 'Second reply']);
  });

  it('returns null when replying to a missing comment', async () => {
    expect(await addReply('nope', 'hello')).toBeNull();
  });

  it('resolves and unresolves', async () => {
    const created = await addComment(baseInput, 'p1');
    await setResolved(created.id, true);
    let [row] = await listComments('ch1', 'p1');
    expect(row.resolved).toBe(true);

    await setResolved(created.id, false);
    [row] = await listComments('ch1', 'p1');
    expect(row.resolved).toBe(false);
  });

  it('deletes comments', async () => {
    const created = await addComment(baseInput, 'p1');
    await deleteComment(created.id);
    expect(await listComments('ch1', 'p1')).toHaveLength(0);
  });

  it('lists orphaned comments after a bulk put', async () => {
    const a = await addComment(baseInput, 'p1');
    await addComment({ ...baseInput, text: 'still anchored' }, 'p1');
    await putComments([{ ...a, orphaned: true }]);

    const orphans = await listOrphaned('ch1', 'p1');
    expect(orphans).toHaveLength(1);
    expect(orphans[0].id).toBe(a.id);
    expect(await listComments('ch1', 'p1')).toHaveLength(2);
  });
});
