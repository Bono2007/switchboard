const test = require('node:test');
const assert = require('node:assert');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { socketPathFor, MAX_SOCKET_PATH_BYTES } = require('../agent-hooks/socket-path');

const LONG_DIR = path.join(os.tmpdir(), 'a'.repeat(120));

test('a short data directory keeps the socket beside the database', () => {
  assert.equal(socketPathFor('/Users/u/.switchboard'), '/Users/u/.switchboard/agent-hooks.sock');
});

// bind() fails with EINVAL past sun_path, and nothing about the path looks wrong.
test('an over-long data directory falls back inside the length limit', () => {
  const resolved = socketPathFor(LONG_DIR);
  assert.ok(Buffer.byteLength(resolved) <= MAX_SOCKET_PATH_BYTES, resolved);
  assert.notEqual(path.dirname(resolved), LONG_DIR);
});

// The server and the hook client each compute this on their own.
test('the fallback is derived from the data directory, not random', () => {
  assert.equal(socketPathFor(LONG_DIR), socketPathFor(LONG_DIR));
  assert.notEqual(socketPathFor(LONG_DIR), socketPathFor(`${LONG_DIR}x`));
});

test('the fallback name is recognisably ours', () => {
  assert.match(path.basename(socketPathFor(LONG_DIR)), /^switchboard-[0-9a-f]{10}\.sock$/);
});

test('the boundary case still binds for real', async () => {
  const resolved = socketPathFor(LONG_DIR);
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(resolved, resolve);
  });
  await new Promise((resolve) => server.close(resolve));
  assert.equal(fs.existsSync(resolved), false, 'node unlinks the socket on close');
});
