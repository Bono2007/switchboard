const test = require('node:test');
const assert = require('node:assert');
const {
  HOOK_EVENTS, desiredCommand, isManagedCommand, commandBinary, reconcile, removeManaged,
} = require('../agent-hooks/config');

const BIN = '/Users/u/.switchboard/hooks/switchboard-hook';
const OTHER = '/Applications/Switchboard.app/Contents/hooks/switchboard-hook';
const FOREIGN = { type: 'command', command: '/usr/local/bin/my-own-notifier' };

const entriesFor = (settings, event) => (settings.hooks?.[event] || []).flatMap(g => g.hooks || []);
const commandsFor = (settings, event) => entriesFor(settings, event).map(h => h.command);

// Only the staged binary exists unless a test says otherwise.
const exists = (list) => (p) => list.includes(p);

// --- mapping ---

test('every managed event maps to a lifecycle phase', () => {
  for (const [event, phase] of Object.entries(HOOK_EVENTS)) {
    assert.ok(['working', 'waiting', 'finished'].includes(phase), `${event} -> ${phase}`);
  }
});

test('the four Claude Code events we rely on are covered', () => {
  assert.deepEqual(Object.keys(HOOK_EVENTS).sort(),
    ['Notification', 'SessionEnd', 'Stop', 'UserPromptSubmit']);
  assert.equal(HOOK_EVENTS.UserPromptSubmit, 'working');
  assert.equal(HOOK_EVENTS.Notification, 'waiting');
  assert.equal(HOOK_EVENTS.Stop, 'finished');
  assert.equal(HOOK_EVENTS.SessionEnd, 'finished');
});

// --- command helpers ---

test('desiredCommand quotes the binary and names the event', () => {
  assert.equal(desiredCommand(BIN, 'Stop'), `"${BIN}" --event Stop`);
});

test('a path containing a double quote is refused rather than quoted', () => {
  assert.throws(() => desiredCommand('/tmp/we"ird/switchboard-hook', 'Stop'), /quote/i);
});

test('isManagedCommand recognises our binary and nothing else', () => {
  assert.equal(isManagedCommand(desiredCommand(BIN, 'Stop')), true);
  assert.equal(isManagedCommand(FOREIGN.command), false);
  assert.equal(isManagedCommand(undefined), false);
});

test('commandBinary extracts the path from a quoted command', () => {
  assert.equal(commandBinary(`"${BIN}" --event Stop`), BIN);
  assert.equal(commandBinary(`${BIN} --event Stop`), BIN);
});

// --- reconcile: install ---

test('reconcile installs every managed event into empty settings', () => {
  const r = reconcile({}, { bin: BIN, pathExists: exists([BIN]) });
  assert.equal(r.changed, true);
  for (const event of Object.keys(HOOK_EVENTS)) {
    assert.deepEqual(commandsFor(r.settings, event), [desiredCommand(BIN, event)]);
  }
});

test('reconcile does not mutate the settings it was given', () => {
  const before = { hooks: { Stop: [] } };
  const frozen = JSON.stringify(before);
  reconcile(before, { bin: BIN, pathExists: exists([BIN]) });
  assert.equal(JSON.stringify(before), frozen);
});

test('reconcile keeps unrelated settings keys untouched', () => {
  const r = reconcile({ model: 'opus', plansDirectory: 'docs/plans' }, { bin: BIN, pathExists: exists([BIN]) });
  assert.equal(r.settings.model, 'opus');
  assert.equal(r.settings.plansDirectory, 'docs/plans');
});

test('reconcile is idempotent', () => {
  const first = reconcile({}, { bin: BIN, pathExists: exists([BIN]) });
  const second = reconcile(first.settings, { bin: BIN, pathExists: exists([BIN]) });
  assert.equal(second.changed, false);
  assert.deepEqual(second.settings, first.settings);
});

// --- reconcile: repair ---

test('a stale entry pointing at a binary that no longer exists is replaced', () => {
  const stale = { hooks: { Stop: [{ hooks: [{ type: 'command', command: desiredCommand(OTHER, 'Stop') }] }] } };
  const r = reconcile(stale, { bin: BIN, pathExists: exists([BIN]) });
  assert.equal(r.changed, true);
  assert.deepEqual(commandsFor(r.settings, 'Stop'), [desiredCommand(BIN, 'Stop')]);
  assert.deepEqual(r.conflicts, []);
});

test('duplicate managed entries collapse to exactly one', () => {
  const dupes = {
    hooks: {
      Stop: [
        { hooks: [{ type: 'command', command: desiredCommand(BIN, 'Stop') }] },
        { hooks: [{ type: 'command', command: desiredCommand(BIN, 'Stop') }] },
      ],
    },
  };
  const r = reconcile(dupes, { bin: BIN, pathExists: exists([BIN]) });
  assert.equal(r.changed, true);
  assert.deepEqual(commandsFor(r.settings, 'Stop'), [desiredCommand(BIN, 'Stop')]);
});

test('a managed entry with the wrong event flag is repaired', () => {
  const wrong = { hooks: { Stop: [{ hooks: [{ type: 'command', command: `"${BIN}" --event Notification` }] }] } };
  const r = reconcile(wrong, { bin: BIN, pathExists: exists([BIN]) });
  assert.deepEqual(commandsFor(r.settings, 'Stop'), [desiredCommand(BIN, 'Stop')]);
});

// --- reconcile: foreign hooks ---

test("someone else's hooks are preserved alongside ours", () => {
  const mine = { hooks: { Stop: [{ hooks: [FOREIGN] }] } };
  const r = reconcile(mine, { bin: BIN, pathExists: exists([BIN]) });
  assert.deepEqual(commandsFor(r.settings, 'Stop'), [FOREIGN.command, desiredCommand(BIN, 'Stop')]);
});

test('a foreign hook alone never counts as a conflict', () => {
  const r = reconcile({ hooks: { Stop: [{ hooks: [FOREIGN] }] } }, { bin: BIN, pathExists: exists([BIN]) });
  assert.deepEqual(r.conflicts, []);
});

// Two installs — a dev build and /Applications — both want to own this entry.
// Rewriting it on every launch would make them fight forever, so the loser
// reports a conflict and leaves the file alone.
test('another live Switchboard install is reported as a conflict, not overwritten', () => {
  const rival = { hooks: { Stop: [{ hooks: [{ type: 'command', command: desiredCommand(OTHER, 'Stop') }] }] } };
  const r = reconcile(rival, { bin: BIN, pathExists: exists([BIN, OTHER]) });
  assert.deepEqual(commandsFor(r.settings, 'Stop'), [desiredCommand(OTHER, 'Stop')]);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].event, 'Stop');
  assert.match(r.conflicts[0].command, /Switchboard\.app/);
});

test('a conflict on one event does not block the others', () => {
  const rival = { hooks: { Stop: [{ hooks: [{ type: 'command', command: desiredCommand(OTHER, 'Stop') }] }] } };
  const r = reconcile(rival, { bin: BIN, pathExists: exists([BIN, OTHER]) });
  assert.equal(r.changed, true, 'the other three events were still installed');
  assert.deepEqual(commandsFor(r.settings, 'Notification'), [desiredCommand(BIN, 'Notification')]);
});

// --- removeManaged ---

test('removeManaged strips our entries and leaves foreign ones', () => {
  const installed = reconcile({ hooks: { Stop: [{ hooks: [FOREIGN] }] } }, { bin: BIN, pathExists: exists([BIN]) });
  const r = removeManaged(installed.settings);
  assert.equal(r.changed, true);
  assert.deepEqual(commandsFor(r.settings, 'Stop'), [FOREIGN.command]);
});

test('removeManaged drops events left empty and the hooks key when nothing remains', () => {
  const installed = reconcile({}, { bin: BIN, pathExists: exists([BIN]) });
  const r = removeManaged(installed.settings);
  assert.equal(r.settings.hooks, undefined);
});

test('removeManaged on settings without our hooks changes nothing', () => {
  const r = removeManaged({ hooks: { Stop: [{ hooks: [FOREIGN] }] } });
  assert.equal(r.changed, false);
});
