/**
 * stale-folders.js — find project folders that were registered but never indexed.
 *
 * `cache_meta` gets rows from two places, and only one of them indexes anything:
 *
 *   - the indexer (worker scan, or refreshFolder) reads the transcripts, fills
 *     session_cache, and stores the folder's real mtime;
 *   - the render path backfills a row for any directory the indexer has not
 *     seen, purely so the project appears in the sidebar, with mtime 0.
 *
 * A folder left in the second state shows up with no sessions under it, and
 * nothing brings it back: the cold-start scan is gated on whether the cache is
 * populated *at all*, so one healthy folder is enough to keep every backfilled
 * one empty forever. Clicking such a project's disclosure arrow expands an empty
 * list, which reads as the arrow being broken.
 *
 * mtime 0 is therefore the marker for "registered, never indexed". Indexing one
 * stores a real mtime, so a folder can only be returned here once.
 */

// Re-reading every transcript of every stale folder in one pass would block the
// main process for seconds — some transcripts run to megabytes. The sidebar
// polls, so a few folders per call heals the whole list within a few cycles
// without a visible stall.
const INDEX_BATCH = 3;

/**
 * @param {Map<string, {projectPath?: string, indexMtimeMs?: number}>|object} folderMeta
 * @param {number} [limit] how many to return at most
 * @returns {string[]} folder names to index now
 */
function foldersNeedingIndex(folderMeta, limit = INDEX_BATCH) {
  const entries = folderMeta instanceof Map
    ? folderMeta.entries()
    : Object.entries(folderMeta || {});

  const pending = [];
  for (const [folder, meta] of entries) {
    if (!meta || !meta.projectPath) continue;
    if (meta.indexMtimeMs) continue;
    pending.push(folder);
    if (pending.length >= limit) break;
  }
  return pending;
}

module.exports = { foldersNeedingIndex, INDEX_BATCH };
