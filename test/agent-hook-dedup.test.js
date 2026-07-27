const test = require('node:test');
const assert = require('node:assert');
const { createDedup, DEDUP_CAPACITY } = require('../agent-hooks/dedup');

test('a fresh id is not a duplicate', () => {
  const d = createDedup();
  assert.equal(d.seen('a'), false);
});

test('the same id twice is a duplicate the second time', () => {
  const d = createDedup();
  d.seen('a');
  assert.equal(d.seen('a'), true);
});

// The bridge retries when an ack is slow, so the retry carries the same id.
// Suppression is what keeps one turn from posting two notifications.
test('a retried id stays suppressed on every later delivery', () => {
  const d = createDedup();
  d.seen('a');
  assert.equal(d.seen('a'), true);
  assert.equal(d.seen('a'), true);
});

test('an empty or missing id is never deduplicated', () => {
  const d = createDedup();
  assert.equal(d.seen(''), false);
  assert.equal(d.seen(''), false);
  assert.equal(d.seen(undefined), false);
  assert.equal(d.seen(null), false);
});

// Checking a forgotten id re-inserts it, so assert the survivors first.
test('the oldest id is evicted once capacity is exceeded', () => {
  const d = createDedup(3);
  d.seen('a'); d.seen('b'); d.seen('c');
  assert.equal(d.seen('d'), false);   // evicts 'a'
  assert.equal(d.seen('b'), true);    // 'b' is still remembered
  assert.equal(d.seen('c'), true);
  assert.equal(d.seen('a'), false);   // 'a' was forgotten, so it delivers again
});

test('re-seeing an id does not refresh its position in the queue', () => {
  const d = createDedup(2);
  d.seen('a'); d.seen('b');
  d.seen('a');                        // duplicate, must not re-queue
  assert.equal(d.seen('c'), false);   // evicts 'a'
  assert.equal(d.seen('b'), true);    // 'b' survived, so only one eviction happened
});

test('capacity defaults to 256', () => {
  assert.equal(DEDUP_CAPACITY, 256);
  const d = createDedup();
  for (let i = 0; i < 256; i++) d.seen(`id-${i}`);
  assert.equal(d.seen('id-0'), true);
  d.seen('overflow');
  assert.equal(d.seen('id-0'), false);
});

test('size reports how many ids are remembered', () => {
  const d = createDedup(4);
  d.seen('a'); d.seen('b'); d.seen('a');
  assert.equal(d.size(), 2);
});
