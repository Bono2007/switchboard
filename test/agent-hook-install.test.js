const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  hooksDir, hookBin, socketPathFor, shimSource, stage,
  reconcileSettings, uninstallSettings, isInstalled, STAGED_FILES,
} = require('../agent-hooks/install');
const { desiredCommand, HOOK_EVENTS } = require('../agent-hooks/config');

const APP_DIR = path.join(__dirname, '..');
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sbi-'));

// --- shim ---

test('the shim prefers node and falls back to Electron', () => {
  const src = shimSource({ scriptPath: '/d/hooks/bin/switchboard-hook.js', electronPath: '/A/Switchboard' });
  assert.match(src, /^#!\/bin\/sh/);
  assert.match(src, /command -v node/);
  assert.match(src, /exec node "\$SCRIPT" "\$@"/);
  assert.match(src, /ELECTRON_RUN_AS_NODE=1 exec "\$ELECTRON"/);
});

// Claude Code must never be blocked by a hook that cannot run.
test('the shim exits zero when neither runtime is available', () => {
  assert.match(shimSource({ scriptPath: '/x', electronPath: '/y' }), /\nexit 0\n$/);
});

// --- staging ---

test('stage copies the client and every module it requires', () => {
  const dataDir = tmpDir();
  const { bin } = stage({ dataDir, appDir: APP_DIR, electronPath: '/A/Switchboard' });
  assert.equal(bin, hookBin(dataDir));
  for (const [, to] of STAGED_FILES) {
    assert.ok(fs.existsSync(path.join(hooksDir(dataDir), to)), `${to} was staged`);
  }
});

// The staged copy must run under a plain node, outside the app bundle.
test('the staged client resolves its own requires', () => {
  const dataDir = tmpDir();
  stage({ dataDir, appDir: APP_DIR, electronPath: '/A/Switchboard' });
  const staged = path.join(hooksDir(dataDir), 'bin', 'switchboard-hook.js');
  const source = fs.readFileSync(staged, 'utf8');
  for (const relative of source.matchAll(/require\('(\.\.?\/[^']+)'\)/g)) {
    const resolved = path.resolve(path.dirname(staged), relative[1]);
    assert.ok(fs.existsSync(`${resolved}.js`), `${relative[1]} resolves next to the staged client`);
  }
});

test('the shim is executable and the sources are not', () => {
  const dataDir = tmpDir();
  const { bin } = stage({ dataDir, appDir: APP_DIR, electronPath: '/A/Switchboard' });
  assert.equal(fs.statSync(bin).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(hooksDir(dataDir), 'agent-hooks', 'protocol.js')).mode & 0o777, 0o600);
});

test('staging twice reports no change the second time', () => {
  const dataDir = tmpDir();
  stage({ dataDir, appDir: APP_DIR, electronPath: '/A/Switchboard' });
  assert.equal(stage({ dataDir, appDir: APP_DIR, electronPath: '/A/Switchboard' }).changed, false);
});

// Dragging the app to /Applications changes execPath; the shim has to follow.
test('a moved app restages the shim', () => {
  const dataDir = tmpDir();
  stage({ dataDir, appDir: APP_DIR, electronPath: '/tmp/Switchboard' });
  const again = stage({ dataDir, appDir: APP_DIR, electronPath: '/Applications/Switchboard' });
  assert.equal(again.changed, true);
  assert.match(fs.readFileSync(again.bin, 'utf8'), /\/Applications\/Switchboard/);
});

test('the socket sits next to the database, not in the hooks directory', () => {
  assert.equal(socketPathFor('/d'), path.join('/d', 'agent-hooks.sock'));
});

// --- settings reconciliation ---

test('reconcileSettings creates a settings file that did not exist', () => {
  const dir = tmpDir();
  const settingsPath = path.join(dir, '.claude', 'settings.json');
  const result = reconcileSettings({ settingsPath, bin: '/d/hooks/switchboard-hook', pathExists: () => false });
  assert.equal(result.repaired, true);
  const written = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.deepEqual(Object.keys(written.hooks).sort(), Object.keys(HOOK_EVENTS).sort());
});

test('reconcileSettings leaves an already-correct file untouched', () => {
  const dir = tmpDir();
  const settingsPath = path.join(dir, 'settings.json');
  const bin = '/d/hooks/switchboard-hook';
  reconcileSettings({ settingsPath, bin, pathExists: () => false });
  const before = fs.statSync(settingsPath).mtimeMs;
  const again = reconcileSettings({ settingsPath, bin, pathExists: () => false });
  assert.equal(again.repaired, false);
  assert.equal(fs.statSync(settingsPath).mtimeMs, before);
});

// Never destroy a user's config because we could not read it.
test('reconcileSettings on an unparseable file starts from empty settings', () => {
  const dir = tmpDir();
  const settingsPath = path.join(dir, 'settings.json');
  fs.writeFileSync(settingsPath, '{ this is not json');
  reconcileSettings({ settingsPath, bin: '/d/hooks/switchboard-hook', pathExists: () => false });
  assert.ok(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).hooks);
});

test('reconcileSettings preserves the rest of the file', () => {
  const dir = tmpDir();
  const settingsPath = path.join(dir, 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify({ model: 'opus', env: { FOO: '1' } }));
  reconcileSettings({ settingsPath, bin: '/d/hooks/switchboard-hook', pathExists: () => false });
  const written = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.equal(written.model, 'opus');
  assert.deepEqual(written.env, { FOO: '1' });
});

// --- install state and uninstall ---

test('isInstalled reports the truth before and after reconciliation', () => {
  const dir = tmpDir();
  const settingsPath = path.join(dir, 'settings.json');
  const bin = '/d/hooks/switchboard-hook';
  assert.equal(isInstalled({ settingsPath, bin }), false);
  reconcileSettings({ settingsPath, bin, pathExists: () => false });
  assert.equal(isInstalled({ settingsPath, bin }), true);
});

test('isInstalled is false when only some events are declared', () => {
  const dir = tmpDir();
  const settingsPath = path.join(dir, 'settings.json');
  const bin = '/d/hooks/switchboard-hook';
  fs.writeFileSync(settingsPath, JSON.stringify({
    hooks: { Stop: [{ hooks: [{ type: 'command', command: desiredCommand(bin, 'Stop') }] }] },
  }));
  assert.equal(isInstalled({ settingsPath, bin }), false);
});

test('uninstallSettings removes our entries and reports it', () => {
  const dir = tmpDir();
  const settingsPath = path.join(dir, 'settings.json');
  const bin = '/d/hooks/switchboard-hook';
  reconcileSettings({ settingsPath, bin, pathExists: () => false });
  assert.equal(uninstallSettings({ settingsPath }).removed, true);
  assert.equal(isInstalled({ settingsPath, bin }), false);
  assert.equal(uninstallSettings({ settingsPath }).removed, false);
});
