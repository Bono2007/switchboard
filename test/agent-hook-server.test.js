const test = require('node:test');
const assert = require('node:assert');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createHookServer } = require('../agent-hooks/server');
const { buildEvent, encodeEvent, parseAck } = require('../agent-hooks/protocol');

const quiet = { debug() {}, info() {}, warn() {}, error() {} };

// Socket paths are capped around 104 bytes on macOS, so stay short.
function tmpSocket() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbh-'));
  return path.join(dir, 's.sock');
}

/** Send one raw line and resolve with the ack line, or null if none arrives. */
function send(socketPath, line, { waitMs = 500 } = {}) {
  return new Promise((resolve) => {
    const socket = net.createConnection(socketPath);
    let buffer = '';
    const done = (value) => { socket.destroy(); resolve(value); };
    const timer = setTimeout(() => done(null), waitMs);
    socket.on('connect', () => socket.write(line));
    socket.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.includes('\n')) { clearTimeout(timer); done(buffer); }
    });
    socket.on('error', () => { clearTimeout(timer); done(null); });
  });
}

const event = (over = {}) => buildEvent({
  id: 'evt-1', provider: 'claude_hook', paneId: 'pane-1', phase: 'finished', ...over,
});

async function withServer(run) {
  const socketPath = tmpSocket();
  const received = [];
  const server = createHookServer({ socketPath, onEvent: (e) => received.push(e), log: quiet });
  await server.start();
  try {
    await run({ socketPath, received, server });
  } finally {
    server.close();
  }
}

test('an accepted event is acked and handed to the callback', async () => {
  await withServer(async ({ socketPath, received }) => {
    const ack = await send(socketPath, encodeEvent(event()));
    assert.deepEqual(parseAck(ack), { ok: true });
    assert.equal(received.length, 1);
    assert.equal(received[0].phase, 'finished');
    assert.equal(received[0].paneId, 'pane-1');
  });
});

test('the socket is created with owner-only permissions', async () => {
  await withServer(async ({ socketPath }) => {
    assert.equal(fs.statSync(socketPath).mode & 0o777, 0o600);
  });
});

// The client cannot tell a lost ack from a slow one, so it re-sends. Acking the
// retry stops the loop; delivering it twice would post two notifications.
test('a retried event is acked again but delivered once', async () => {
  await withServer(async ({ socketPath, received }) => {
    const line = encodeEvent(event());
    assert.deepEqual(parseAck(await send(socketPath, line)), { ok: true });
    assert.deepEqual(parseAck(await send(socketPath, line)), { ok: true });
    assert.equal(received.length, 1);
  });
});

test('events without an id are never deduplicated', async () => {
  await withServer(async ({ socketPath, received }) => {
    const line = encodeEvent(event({ id: '' }));
    await send(socketPath, line);
    await send(socketPath, line);
    assert.equal(received.length, 2);
  });
});

test('a malformed line gets no ack and no delivery', async () => {
  await withServer(async ({ socketPath, received }) => {
    assert.equal(await send(socketPath, '{not json}\n', { waitMs: 200 }), null);
    assert.equal(received.length, 0);
  });
});

test('an event from a future protocol version is refused', async () => {
  await withServer(async ({ socketPath, received }) => {
    const line = `${JSON.stringify({ ...event(), v: 99 })}\n`;
    assert.equal(await send(socketPath, line, { waitMs: 200 }), null);
    assert.equal(received.length, 0);
  });
});

test('two events in one write are both delivered', async () => {
  await withServer(async ({ socketPath, received }) => {
    const line = encodeEvent(event({ id: 'a', phase: 'working' })) + encodeEvent(event({ id: 'b' }));
    await send(socketPath, line);
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(received.map((e) => e.phase), ['working', 'finished']);
  });
});

test('a throwing handler does not take the server down', async () => {
  const socketPath = tmpSocket();
  let calls = 0;
  const server = createHookServer({
    socketPath,
    onEvent: () => { calls++; throw new Error('boom'); },
    log: quiet,
  });
  await server.start();
  try {
    await send(socketPath, encodeEvent(event({ id: 'a' })));
    assert.deepEqual(parseAck(await send(socketPath, encodeEvent(event({ id: 'b' })))), { ok: true });
    assert.equal(calls, 2);
  } finally {
    server.close();
  }
});

// A crash leaves the socket file behind; the next launch has to reclaim it.
test('a leftover socket file from a dead process is reclaimed', async () => {
  const socketPath = tmpSocket();
  fs.mkdirSync(path.dirname(socketPath), { recursive: true });
  fs.writeFileSync(socketPath, '');
  const server = createHookServer({ socketPath, onEvent: () => {}, log: quiet });
  await server.start();
  try {
    assert.deepEqual(parseAck(await send(socketPath, encodeEvent(event()))), { ok: true });
  } finally {
    server.close();
  }
});

test('a second server refuses to steal a live socket', async () => {
  await withServer(async ({ socketPath }) => {
    const rival = createHookServer({ socketPath, onEvent: () => {}, log: quiet });
    await assert.rejects(() => rival.start(), /already owns/);
  });
});

test('close removes the socket file', async () => {
  const socketPath = tmpSocket();
  const server = createHookServer({ socketPath, onEvent: () => {}, log: quiet });
  await server.start();
  server.close();
  assert.equal(fs.existsSync(socketPath), false);
});
