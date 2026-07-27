/**
 * socket-path.js — where the hook socket lives.
 *
 * A Unix socket path is copied into sockaddr_un.sun_path, which is 104 bytes on
 * macOS and 108 on Linux. Longer than that and bind() fails with EINVAL —
 * silently, from the caller's point of view, since nothing about the path looks
 * wrong. SWITCHBOARD_DATA_DIR can point anywhere, so this is reachable in
 * practice, not a theoretical limit.
 *
 * Beyond the limit we fall back to a short name under the temp directory,
 * derived from the data directory so the server and the client independently
 * agree on it without passing anything around.
 *
 * Staged next to the hook client — both ends must resolve this identically.
 */
const crypto = require('crypto');
const os = require('os');
const path = require('path');

// 104 on macOS is the tightest; leave headroom for the terminating byte.
const MAX_SOCKET_PATH_BYTES = 100;
const SOCKET_NAME = 'agent-hooks.sock';

function socketPathFor(dataDir) {
  const preferred = path.join(dataDir, SOCKET_NAME);
  if (Buffer.byteLength(preferred, 'utf8') <= MAX_SOCKET_PATH_BYTES) return preferred;
  const digest = crypto.createHash('sha1').update(dataDir).digest('hex').slice(0, 10);
  return path.join(os.tmpdir(), `switchboard-${digest}.sock`);
}

module.exports = { socketPathFor, MAX_SOCKET_PATH_BYTES, SOCKET_NAME };
