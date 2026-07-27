/**
 * dedup.js — suppress events the client had to re-send.
 *
 * The hook client retries when an ack does not arrive inside its delivery
 * budget, so a slow ack delivers the same event twice. The server still acks
 * the repeat (otherwise the client keeps retrying) but must not apply it: a
 * duplicate would post a second notification for one finished turn.
 *
 * FIFO eviction over a small fixed window. Re-seeing an id does not refresh its
 * position — the window bounds memory, it is not a cache.
 */
const DEDUP_CAPACITY = 256;

function createDedup(capacity = DEDUP_CAPACITY) {
  const ids = new Set();
  const order = [];

  return Object.freeze({
    /**
     * Record an id and report whether it was already known.
     * An empty or missing id is never deduplicated: without an id there is no
     * way to tell a retry from a genuine second event, and dropping a real one
     * is worse than showing a duplicate.
     */
    seen(id) {
      if (typeof id !== 'string' || id === '') return false;
      if (ids.has(id)) return true;
      ids.add(id);
      order.push(id);
      while (order.length > capacity) {
        ids.delete(order.shift());
      }
      return false;
    },
    size() {
      return ids.size;
    },
  });
}

module.exports = { createDedup, DEDUP_CAPACITY };
