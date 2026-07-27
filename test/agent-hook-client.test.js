const test = require('node:test');
const assert = require('node:assert');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createHookServer } = require('../agent-hooks/server');

const CLIENT = path.join(__dirname, '..', 'bin', 'switchboard-hook.js');
const quiet = { debug() {}, info() {}, warn() {}, error() {} };

// Runs the client exactly as the shim would, under whichever runtime the tests
// are using (Electron-as-node when invoked through `npm test`).
function runClient(args, { env = {}, stdin = '' } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = execFile(
      process.execPath, [CLIENT, ...args],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...env }, timeout: 5000 },
      (err, stdout, stderr) => resolve({
        code: err ? (err.code ?? 1) : 0, stdout, stderr, ms: Date.now() - started,
      }),
    );
    child.stdin.end(stdin);
  });
}

function tmpSocket() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sbc-')), 's.sock');
}

async function withServer(run) {
  const socketPath = tmpSocket();
  const received = [];
  const server = createHookServer({ socketPath, onEvent: (e) => received.push(e), log: quiet });
  await server.start();
  try {
    await run({ socketPath, received });
  } finally {
    server.close();
  }
}

const payload = JSON.stringify({ session_id: 'cli-abc', cwd: '/tmp' });

test('a Stop hook reports the pane it was launched in', async () => {
  await withServer(async ({ socketPath, received }) => {
    const r = await runClient(['--event', 'Stop'], {
      env: { SWITCHBOARD_HOOK_SOCK: socketPath, SWITCHBOARD_SESSION_ID: 'pane-1' },
      stdin: payload,
    });
    assert.equal(r.code, 0);
    assert.equal(received.length, 1);
    assert.equal(received[0].phase, 'finished');
    assert.equal(received[0].paneId, 'pane-1');
    assert.equal(received[0].sessionId, 'cli-abc');
  });
});

// UserPromptSubmit feeds hook stdout back to the model as context.
test('the client never writes to stdout', async () => {
  await withServer(async ({ socketPath }) => {
    for (const event of ['UserPromptSubmit', 'Notification', 'Stop', 'SessionEnd']) {
      const r = await runClient(['--event', event], {
        env: { SWITCHBOARD_HOOK_SOCK: socketPath, SWITCHBOARD_SESSION_ID: 'pane-1' },
        stdin: payload,
      });
      assert.equal(r.stdout, '', `${event} wrote to stdout`);
    }
  });
});

test('a Notification hook forwards the CLI message', async () => {
  await withServer(async ({ socketPath, received }) => {
    await runClient(['--event', 'Notification'], {
      env: { SWITCHBOARD_HOOK_SOCK: socketPath, SWITCHBOARD_SESSION_ID: 'pane-1' },
      stdin: JSON.stringify({ session_id: 'cli-abc', message: 'Claude needs your permission to use Bash' }),
    });
    assert.equal(received[0].phase, 'waiting');
    assert.equal(received[0].body, 'Claude needs your permission to use Bash');
  });
});

// The settings panel runs this with no session around it.
test('a test event delivers without any session environment', async () => {
  await withServer(async ({ socketPath, received }) => {
    const r = await runClient(['--event', 'test', '--test'], { env: { SWITCHBOARD_HOOK_SOCK: socketPath } });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /delivered/);
    assert.equal(received.length, 1);
    assert.equal(received[0].test, true);
  });
});

test('a failing test event reports a non-zero exit code', async () => {
  const r = await runClient(['--event', 'test', '--test'], {
    env: { SWITCHBOARD_HOOK_SOCK: path.join(os.tmpdir(), 'sb-nothing-here.sock') },
  });
  assert.notEqual(r.code, 0);
});

// Switchboard being closed is the normal case, and must cost the agent nothing.
test('with nothing listening the client exits zero, well inside its budget', async () => {
  const r = await runClient(['--event', 'Stop'], {
    env: {
      SWITCHBOARD_HOOK_SOCK: path.join(os.tmpdir(), 'sb-nothing-here.sock'),
      SWITCHBOARD_SESSION_ID: 'pane-1',
    },
    stdin: payload,
  });
  assert.equal(r.code, 0);
  assert.ok(r.ms < 3000, `took ${r.ms}ms`);
});

test('an unknown event name is ignored without failing', async () => {
  await withServer(async ({ socketPath, received }) => {
    const r = await runClient(['--event', 'PreCompact'], {
      env: { SWITCHBOARD_HOOK_SOCK: socketPath, SWITCHBOARD_SESSION_ID: 'pane-1' },
      stdin: payload,
    });
    assert.equal(r.code, 0);
    assert.equal(received.length, 0);
  });
});

test('a garbled payload still reports the pane', async () => {
  await withServer(async ({ socketPath, received }) => {
    await runClient(['--event', 'Stop'], {
      env: { SWITCHBOARD_HOOK_SOCK: socketPath, SWITCHBOARD_SESSION_ID: 'pane-1' },
      stdin: 'not json at all',
    });
    assert.equal(received.length, 1);
    assert.equal(received[0].sessionId, null);
    assert.equal(received[0].paneId, 'pane-1');
  });
});
