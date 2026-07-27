/**
 * server.js — the Unix socket that receives agent hook events.
 *
 * Deliberately dumb: it owns the transport, the validation and the duplicate
 * window, and hands every accepted event to one callback. Resolving which
 * Switchboard session an event belongs to, and what to do about it, lives in
 * the caller — that is the part that needs the app's state.
 *
 * Anything malformed is dropped without an ack, so a client speaking the wrong
 * protocol gets no encouragement to retry. A duplicate *is* acked (otherwise
 * the client keeps retrying) and then discarded.
 */
const net = require('net');
const fs = require('fs');
const path = require('path');

const { parseEvent, buildAck, MAX_LINE_BYTES } = require('./protocol');
const { createDedup } = require('./dedup');

/**
 * @param {object} opts
 * @param {string} opts.socketPath
 * @param {(event: object) => void} opts.onEvent  called for each accepted, non-duplicate event
 * @param {{debug: Function, info: Function, warn: Function, error: Function}} [opts.log]
 */
function createHookServer({ socketPath, onEvent, log = console }) {
  const dedup = createDedup();
  let server = null;

  function handleLine(line, socket) {
    const parsed = parseEvent(line);
    if (!parsed.ok) {
      log.warn?.(`[hooks] rejected event: ${parsed.error}`);
      return;
    }
    // Ack before doing any work: the client is holding an agent's turn open.
    try { socket.write(buildAck(true)); } catch {}

    if (dedup.seen(parsed.event.id)) {
      log.debug?.(`[hooks] duplicate ${parsed.event.id} suppressed`);
      return;
    }
    try {
      onEvent(parsed.event);
    } catch (err) {
      log.error?.(`[hooks] handler failed: ${err.message}`);
    }
  }

  function handleConnection(socket) {
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.length > MAX_LINE_BYTES) {
        log.warn?.('[hooks] client exceeded the line cap');
        socket.destroy();
        return;
      }
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.trim()) handleLine(line, socket);
      }
    });
    socket.on('error', () => socket.destroy());
  }

  /**
   * A socket file left behind by a crash makes bind fail with EADDRINUSE.
   * Only remove it once nothing answers — a live Switchboard must keep its own.
   */
  function clearStaleSocket() {
    return new Promise((resolve) => {
      const probe = net.createConnection(socketPath);
      const giveUp = (alive) => {
        probe.destroy();
        if (!alive) { try { fs.unlinkSync(socketPath); } catch {} }
        resolve(alive);
      };
      probe.setTimeout(200, () => giveUp(true));
      probe.on('connect', () => giveUp(true));
      probe.on('error', () => giveUp(false));
    });
  }

  async function start() {
    fs.mkdirSync(path.dirname(socketPath), { recursive: true, mode: 0o700 });
    if (fs.existsSync(socketPath) && (await clearStaleSocket())) {
      throw new Error(`another Switchboard already owns ${socketPath}`);
    }

    server = net.createServer(handleConnection);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    // The socket carries session ids and drives the UI: keep it to this user.
    try { fs.chmodSync(socketPath, 0o600); } catch {}
    server.on('error', (err) => log.error?.(`[hooks] server error: ${err.message}`));
    log.info?.(`[hooks] listening on ${socketPath}`);
    return socketPath;
  }

  function close() {
    if (!server) return;
    try { server.close(); } catch {}
    try { fs.unlinkSync(socketPath); } catch {}
    server = null;
  }

  return Object.freeze({ start, close, dedupSize: () => dedup.size() });
}

module.exports = { createHookServer };
