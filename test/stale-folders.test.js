const test = require('node:test');
const assert = require('node:assert');
const { foldersNeedingIndex, INDEX_BATCH } = require('../stale-folders');

const meta = (entries) => new Map(Object.entries(entries));

// A folder is registered in cache_meta from two places. The indexer stores the
// real folder mtime; the render path backfills a projectPath with mtime 0 just
// so the directory shows up. Only the second kind has never been indexed.
test('a folder backfilled with mtime 0 needs indexing', () => {
  const folders = foldersNeedingIndex(meta({
    'a': { projectPath: '/p/a', indexMtimeMs: 0 },
  }));
  assert.deepEqual(folders, ['a']);
});

test('a folder with a real mtime is left alone', () => {
  assert.deepEqual(foldersNeedingIndex(meta({
    'a': { projectPath: '/p/a', indexMtimeMs: 1784815290031 },
  })), []);
});

test('a folder with no project path is skipped', () => {
  assert.deepEqual(foldersNeedingIndex(meta({
    'a': { projectPath: null, indexMtimeMs: 0 },
  })), []);
});

test('missing or malformed metadata is skipped rather than thrown on', () => {
  assert.deepEqual(foldersNeedingIndex(meta({
    'a': null,
    'b': undefined,
    'c': {},
    'd': { projectPath: '/p/d' },
  })), ['d'], 'an absent indexMtimeMs counts as never indexed');
});

test('an empty map yields nothing', () => {
  assert.deepEqual(foldersNeedingIndex(new Map()), []);
});

test('a plain object is accepted as well as a Map', () => {
  assert.deepEqual(foldersNeedingIndex({ a: { projectPath: '/p/a', indexMtimeMs: 0 } }), ['a']);
});

// Re-reading every transcript of 38 folders in one pass would freeze the main
// process for seconds. The sidebar polls, so healing a few folders per call
// gets there within a few cycles without a visible stall.
test('only a bounded batch is returned per call', () => {
  const many = {};
  for (let i = 0; i < 50; i++) many[`f${i}`] = { projectPath: `/p/${i}`, indexMtimeMs: 0 };
  const folders = foldersNeedingIndex(meta(many));
  assert.equal(folders.length, INDEX_BATCH);
  assert.ok(INDEX_BATCH > 0 && INDEX_BATCH < 50);
});

test('the batch size can be overridden', () => {
  const many = {};
  for (let i = 0; i < 10; i++) many[`f${i}`] = { projectPath: `/p/${i}`, indexMtimeMs: 0 };
  assert.equal(foldersNeedingIndex(meta(many), 2).length, 2);
});

test('fewer stale folders than the batch returns them all', () => {
  assert.deepEqual(foldersNeedingIndex(meta({
    'a': { projectPath: '/p/a', indexMtimeMs: 0 },
    'b': { projectPath: '/p/b', indexMtimeMs: 5 },
    'c': { projectPath: '/p/c', indexMtimeMs: 0 },
  })), ['a', 'c']);
});
