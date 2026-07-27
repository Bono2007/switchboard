const test = require('node:test');
const assert = require('node:assert');
const {
  PROTOCOL_VERSION, PHASES, MAX_LINE_BYTES,
  buildEvent, encodeEvent, parseEvent, buildAck, parseAck,
} = require('../agent-hooks/protocol');

const valid = { id: 'abc', sessionId: 'sess-1', provider: 'claude_hook', phase: 'working' };

// --- buildEvent ---

test('buildEvent stamps the protocol version and kind', () => {
  const e = buildEvent(valid);
  assert.equal(e.v, PROTOCOL_VERSION);
  assert.equal(e.kind, 'agent_event');
});

test('buildEvent rejects an unknown phase', () => {
  assert.throws(() => buildEvent({ ...valid, phase: 'thinking' }), /phase/);
});

test('buildEvent rejects an event that names no target at all', () => {
  assert.throws(() => buildEvent({ id: 'a', provider: 'p', phase: 'working' }), /paneId/);
});

test('buildEvent accepts pids instead of an id', () => {
  const e = buildEvent({ id: 'a', provider: 'p', phase: 'working', pids: [42, 7] });
  assert.equal(e.sessionId, null);
  assert.equal(e.paneId, null);
  assert.deepEqual(e.pids, [42, 7]);
});

// The pane id survives a fork or a compact; the CLI's session id does not.
test('buildEvent carries the pane id alongside the session id', () => {
  const e = buildEvent({ ...valid, paneId: 'pane-9' });
  assert.equal(e.paneId, 'pane-9');
  assert.equal(e.sessionId, 'sess-1');
});

test('buildEvent accepts a pane id on its own', () => {
  assert.equal(buildEvent({ id: 'a', provider: 'p', phase: 'working', paneId: 'pane-9' }).paneId, 'pane-9');
});

test('buildEvent rejects a pane id with shell metacharacters', () => {
  assert.throws(() => buildEvent({ ...valid, paneId: 'a;rm -rf /' }), /paneId/);
});

test('buildEvent truncates title and body', () => {
  const e = buildEvent({ ...valid, title: 'x'.repeat(500), body: 'y'.repeat(500) });
  assert.equal(e.title.length, 200);
  assert.equal(e.body.length, 200);
});

test('buildEvent returns a frozen object', () => {
  assert.ok(Object.isFrozen(buildEvent(valid)));
});

// --- encode / parse round trip ---

test('encodeEvent produces a single newline-terminated line', () => {
  const line = encodeEvent(buildEvent(valid));
  assert.equal(line.slice(-1), '\n');
  assert.equal(line.trimEnd().includes('\n'), false);
});

test('parseEvent round-trips an encoded event', () => {
  const e = buildEvent({ ...valid, title: 'Claude Code', body: 'Done' });
  const back = parseEvent(encodeEvent(e));
  assert.equal(back.ok, true);
  assert.deepEqual(back.event, e);
});

// --- parseEvent rejections ---

test('parseEvent rejects malformed JSON', () => {
  assert.equal(parseEvent('{nope').ok, false);
});

test('parseEvent rejects a non-object payload', () => {
  assert.equal(parseEvent('"hello"').ok, false);
  assert.equal(parseEvent('[]').ok, false);
});

test('parseEvent rejects the wrong protocol version', () => {
  const wrong = JSON.stringify({ ...buildEvent(valid), v: 99 });
  const r = parseEvent(wrong);
  assert.equal(r.ok, false);
  assert.match(r.error, /version/i);
});

test('parseEvent rejects the wrong kind', () => {
  const wrong = JSON.stringify({ ...buildEvent(valid), kind: 'ack' });
  assert.equal(parseEvent(wrong).ok, false);
});

test('parseEvent rejects an empty provider', () => {
  const wrong = JSON.stringify({ ...buildEvent(valid), provider: '' });
  assert.equal(parseEvent(wrong).ok, false);
});

test('parseEvent rejects an unknown phase', () => {
  const wrong = JSON.stringify({ ...buildEvent(valid), phase: 'napping' });
  assert.equal(parseEvent(wrong).ok, false);
});

test('parseEvent rejects a session id with shell metacharacters', () => {
  const wrong = JSON.stringify({ ...buildEvent(valid), sessionId: 'a;rm -rf /' });
  assert.equal(parseEvent(wrong).ok, false);
});

test('parseEvent rejects a pane id with shell metacharacters', () => {
  const wrong = JSON.stringify({ ...buildEvent(valid), paneId: '../../etc/passwd' });
  assert.equal(parseEvent(wrong).ok, false);
});

test('parseEvent rejects an event that names no target', () => {
  const wrong = JSON.stringify({ ...buildEvent(valid), sessionId: null, paneId: null, pids: [] });
  assert.equal(parseEvent(wrong).ok, false);
});

test('parseEvent rejects an over-long line', () => {
  const huge = 'x'.repeat(MAX_LINE_BYTES + 1);
  assert.equal(parseEvent(huge).ok, false);
});

test('parseEvent keeps the test flag as a real boolean', () => {
  const e = parseEvent(encodeEvent(buildEvent({ ...valid, test: true })));
  assert.equal(e.event.test, true);
  const plain = parseEvent(encodeEvent(buildEvent(valid)));
  assert.equal(plain.event.test, false);
});

// PHASES is the single source of truth for both ends of the wire.
test('PHASES covers exactly the three lifecycle phases', () => {
  assert.deepEqual([...PHASES].sort(), ['finished', 'waiting', 'working']);
});

// --- ack ---

test('buildAck round-trips through parseAck', () => {
  assert.deepEqual(parseAck(buildAck(true)), { ok: true });
  assert.deepEqual(parseAck(buildAck(false)), { ok: false });
});

test('parseAck returns null for anything that is not an ack', () => {
  assert.equal(parseAck('{"v":1,"kind":"agent_event"}\n'), null);
  assert.equal(parseAck('garbage'), null);
});
