const test = require('node:test');
const assert = require('node:assert');
const {
  createAgentStatus, WORKING_GRACE_MS, WAITING_GRACE_MS,
} = require('../agent-hooks/status');

// Minimal controllable clock: timers are collected, never fired on their own.
function harness({ alive = () => false } = {}) {
  const timers = new Map();
  let next = 1;
  const changes = [];
  const store = createAgentStatus({
    setTimer: (fn, ms) => { const id = next++; timers.set(id, { fn, ms }); return id; },
    clearTimer: (id) => { timers.delete(id); },
    isProcessAlive: alive,
    onChange: (sessionId, change) => changes.push({ sessionId, ...change }),
  });
  return {
    store, changes, timers,
    pending: () => [...timers.values()],
    fire: () => {
      // Fires every currently-scheduled timer once, in creation order.
      const due = [...timers.entries()];
      for (const [id, t] of due) { timers.delete(id); t.fn(); }
    },
  };
}

// --- hooks are authoritative and immediate ---

test('a working hook moves the session to working', () => {
  const h = harness();
  h.store.applyHook('s', 'working');
  assert.equal(h.store.status('s'), 'working');
  assert.deepEqual(h.changes,
    [{ sessionId: 's', status: 'working', previous: 'idle', source: 'hook', message: null }]);
});

// The Notification hook says *why* it is waiting; that text is the badge.
test('a waiting hook carries its message into the change', () => {
  const h = harness();
  h.store.applyHook('s', 'waiting', { message: 'Claude needs your permission to use Bash' });
  assert.equal(h.changes.at(-1).message, 'Claude needs your permission to use Bash');
});

test('a message does not survive into the next status', () => {
  const h = harness();
  h.store.applyHook('s', 'waiting', { message: 'permission please' });
  h.store.applyHook('s', 'working');
  assert.equal(h.changes.at(-1).message, null);
});

test('a finished hook maps to idle', () => {
  const h = harness();
  h.store.applyHook('s', 'working');
  h.store.applyHook('s', 'finished');
  assert.equal(h.store.status('s'), 'idle');
});

test('a waiting hook moves the session to waiting', () => {
  const h = harness();
  h.store.applyHook('s', 'waiting');
  assert.equal(h.store.status('s'), 'waiting');
});

test('repeating the same phase emits nothing', () => {
  const h = harness();
  h.store.applyHook('s', 'working');
  h.store.applyHook('s', 'working');
  assert.equal(h.changes.length, 1);
});

test('the first hook event marks the session as hooked', () => {
  const h = harness();
  assert.equal(h.store.isHooked('s'), false);
  h.store.applyHook('s', 'working');
  assert.equal(h.store.isHooked('s'), true);
});

// --- detection alone keeps working exactly as it does today ---

test('without hooks, detection applies immediately in both directions', () => {
  const h = harness();
  h.store.applyDetection('s', { busy: true });
  assert.equal(h.store.status('s'), 'working');
  h.store.applyDetection('s', { busy: false });
  assert.equal(h.store.status('s'), 'idle');
  assert.equal(h.pending().length, 0, 'no grace window when nothing is hooked');
});

// --- detection becomes advisory once hooks are live ---

test('once hooked, a detected idle only schedules a grace window', () => {
  const h = harness();
  h.store.applyHook('s', 'working');
  h.store.applyDetection('s', { busy: false });
  assert.equal(h.store.status('s'), 'working', 'not idled yet');
  assert.deepEqual(h.pending().map(t => t.ms), [WORKING_GRACE_MS]);
});

test('the working grace window is four seconds', () => {
  assert.equal(WORKING_GRACE_MS, 4000);
});

test('a hook arriving inside the window always wins', () => {
  const h = harness();
  h.store.applyHook('s', 'working');
  h.store.applyDetection('s', { busy: false });
  h.store.applyHook('s', 'waiting');           // the turn asked a question
  assert.equal(h.pending().length, 0, 'the pending idle was cancelled');
  h.fire();
  assert.equal(h.store.status('s'), 'waiting');
});

test('the grace window idles a working session when no hook arrives', () => {
  const h = harness();
  h.store.applyHook('s', 'working');
  h.store.applyDetection('s', { busy: false });
  h.fire();
  assert.equal(h.store.status('s'), 'idle');
  assert.equal(h.changes.at(-1).source, 'detection');
});

// --- waiting is protected far more aggressively ---

test('a waiting session uses the thirty-second window', () => {
  const h = harness();
  h.store.applyHook('s', 'waiting', { pid: 123 });
  h.store.applyDetection('s', { busy: false });
  assert.deepEqual(h.pending().map(t => t.ms), [WAITING_GRACE_MS]);
  assert.equal(WAITING_GRACE_MS, 30000);
});

// A waiting agent still owns a live process — it is sitting on your answer.
// Idling it because it left the foreground would clear the badge you need.
test('a waiting session with a live process is never idled, only re-checked', () => {
  const h = harness({ alive: () => true });
  h.store.applyHook('s', 'waiting', { pid: 123 });
  h.store.applyDetection('s', { busy: false });
  h.fire();
  assert.equal(h.store.status('s'), 'waiting');
  assert.deepEqual(h.pending().map(t => t.ms), [WAITING_GRACE_MS], 'another check was scheduled');
});

// The Stop hook never runs when the agent is killed, so the process check is
// the only thing that recovers the pane.
test('a waiting session whose process died is idled at the end of the window', () => {
  const h = harness({ alive: () => false });
  h.store.applyHook('s', 'waiting', { pid: 123 });
  h.store.applyDetection('s', { busy: false });
  h.fire();
  assert.equal(h.store.status('s'), 'idle');
});

test('a waiting session with no known pid is idled at the end of the window', () => {
  const h = harness({ alive: () => { throw new Error('should not be consulted'); } });
  h.store.applyHook('s', 'waiting');
  h.store.applyDetection('s', { busy: false });
  h.fire();
  assert.equal(h.store.status('s'), 'idle');
});

// --- detected activity is always trusted upward ---

test('detected activity applies immediately even when hooked', () => {
  const h = harness();
  h.store.applyHook('s', 'waiting');
  h.store.applyDetection('s', { busy: true });
  assert.equal(h.store.status('s'), 'working');
});

test('detected activity cancels a pending idle', () => {
  const h = harness();
  h.store.applyHook('s', 'working');
  h.store.applyDetection('s', { busy: false });
  h.store.applyDetection('s', { busy: true });
  assert.equal(h.pending().length, 0);
  assert.equal(h.store.status('s'), 'working');
});

// --- session lifetime ---

test('ending a session clears its pending timer', () => {
  const h = harness();
  h.store.applyHook('s', 'working');
  h.store.applyDetection('s', { busy: false });
  h.store.endSession('s');
  assert.equal(h.pending().length, 0);
});

test('ending a working session reports it as idle', () => {
  const h = harness();
  h.store.applyHook('s', 'working');
  h.store.endSession('s');
  assert.equal(h.changes.at(-1).status, 'idle');
  assert.equal(h.store.status('s'), 'idle');
});

test('ending an already idle session emits nothing', () => {
  const h = harness();
  h.store.endSession('s');
  assert.deepEqual(h.changes, []);
});

// A late Stop hook must not bring a closed pane back to life.
test('a hook for an ended session does not resurrect it', () => {
  const h = harness();
  h.store.applyHook('s', 'working');
  h.store.endSession('s');
  h.store.applyHook('s', 'finished');
  assert.equal(h.store.isHooked('s'), false);
  assert.equal(h.changes.filter(c => c.sessionId === 's').length, 2);
});

test('a new turn after an ended session starts a fresh one', () => {
  const h = harness();
  h.store.applyHook('s', 'working');
  h.store.endSession('s');
  h.store.applyHook('s', 'working');
  assert.equal(h.store.status('s'), 'working');
  assert.equal(h.store.isHooked('s'), true);
});

// --- health reporting ---

test('lastEventAt records when a hook was last heard from', () => {
  const h = harness();
  assert.equal(h.store.lastEventAt('s'), null);
  h.store.applyHook('s', 'working', { ts: 1700 });
  assert.equal(h.store.lastEventAt('s'), 1700);
});

test('snapshot lists every tracked session', () => {
  const h = harness();
  h.store.applyHook('a', 'working');
  h.store.applyDetection('b', { busy: true });
  const snap = h.store.snapshot();
  assert.deepEqual(snap.map(s => s.sessionId).sort(), ['a', 'b']);
  assert.equal(snap.find(s => s.sessionId === 'a').hooked, true);
  assert.equal(snap.find(s => s.sessionId === 'b').hooked, false);
});
