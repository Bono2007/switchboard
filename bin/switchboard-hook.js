#!/usr/bin/env node
/**
 * switchboard-hook — the client half of the agent-status protocol.
 *
 * Claude Code runs this inside its own turn, so the contract is strict:
 *
 *   - it never writes to stdout. UserPromptSubmit feeds hook stdout back to the
 *     model as context, so a stray line here would end up in your conversation.
 *   - it always exits 0. Exit code 2 makes the CLI block on the hook.
 *   - it gives up after 400 ms, total, across reading stdin, connecting,
 *     writing, and waiting for the ack. A status badge is never worth stalling
 *     an agent, and Switchboard is usually not even running.
 *
 * Usage (installed automatically into ~/.claude/settings.json):
 *   switchboard-hook --event Stop
 *   switchboard-hook --event test --test    # exit code reports delivery
 */
const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { buildEvent, encodeEvent, parseAck } = require('../agent-hooks/protocol');
const { HOOK_EVENTS } = require('../agent-hooks/config');
const { socketPathFor } = require('../agent-hooks/socket-path');

const DELIVERY_BUDGET_MS = 400;
const MAX_STDIN_BYTES = 1024 * 1024;
const PROVIDER = 'claude_hook';
// A test runs from the settings panel, outside any session, so it has no pane
// of its own to name. The server discards test events before resolving them.
const TEST_PANE_ID = 'switchboard-test';

const started = process.hrtime.bigint();
const elapsedMs = () => Number(process.hrtime.bigint() - started) / 1e6;
const remainingMs = () => Math.max(0, DELIVERY_BUDGET_MS - elapsedMs());

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

function socketPath() {
  if (process.env.SWITCHBOARD_HOOK_SOCK) return process.env.SWITCHBOARD_HOOK_SOCK;
  return socketPathFor(process.env.SWITCHBOARD_DATA_DIR || path.join(os.homedir(), '.switchboard'));
}

/**
 * Read the hook payload. Hitting the cap returns what we have instead of
 * draining the rest — an oversized payload is malformed, not interesting.
 */
function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    const chunks = [];
    let size = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString('utf8'));
    };
    const timer = setTimeout(finish, Math.min(150, remainingMs()));
    process.stdin.on('data', (chunk) => {
      size += chunk.length;
      chunks.push(chunk);
      if (size >= MAX_STDIN_BYTES) finish();
    });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
  });
}

/** One delivery attempt. Resolves true only on an acknowledged event. */
function deliver(line, budgetMs) {
  return new Promise((resolve) => {
    if (budgetMs <= 0) return resolve({ ok: false, error: 'budget exhausted' });

    let settled = false;
    const done = (ok, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.destroy(); } catch {}
      resolve({ ok, error: error || null });
    };

    const socket = net.createConnection(socketPath());
    const timer = setTimeout(() => done(false, 'timeout'), budgetMs);
    socket.setEncoding('utf8');

    let buffer = '';
    socket.on('connect', () => socket.write(line));
    socket.on('data', (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline === -1) return;
      const ack = parseAck(buffer.slice(0, newline + 1));
      done(ack !== null && ack.ok, ack === null ? 'malformed ack' : null);
    });
    socket.on('error', (err) => done(false, err.code || err.message));
    socket.on('close', () => done(false, 'closed before ack'));
  });
}

// Switchboard being closed is the common case, not a fault worth recording.
const EXPECTED_ERRORS = new Set(['ENOENT', 'ECONNREFUSED', 'budget exhausted']);

function logFailure(error, event) {
  if (EXPECTED_ERRORS.has(error)) return;
  try {
    const dir = process.env.SWITCHBOARD_DATA_DIR || path.join(os.homedir(), '.switchboard');
    const file = path.join(dir, 'hooks.log');
    const line = `${new Date().toISOString()} ${PROVIDER} ${event} failed: ${error}\n`;
    fs.appendFileSync(file, line, { mode: 0o600 });
  } catch {
    // A hook that cannot log must still not fail.
  }
}

async function main() {
  const eventName = argValue('--event') || '';
  const isTest = process.argv.includes('--test');
  const phase = isTest ? 'finished' : HOOK_EVENTS[eventName];
  if (!phase) return isTest ? 1 : 0;

  const raw = await readStdin();
  let payload = {};
  try {
    payload = JSON.parse(raw) || {};
  } catch {
    payload = {};
  }

  let event;
  try {
    event = buildEvent({
      id: crypto.randomUUID(),
      provider: PROVIDER,
      paneId: process.env.SWITCHBOARD_SESSION_ID || (isTest ? TEST_PANE_ID : null),
      sessionId: typeof payload.session_id === 'string' ? payload.session_id : null,
      phase,
      title: 'Claude Code',
      body: typeof payload.message === 'string' ? payload.message : eventName,
      ts: Date.now(),
      test: isTest,
    });
  } catch {
    // No usable target — nothing to report against.
    return isTest ? 1 : 0;
  }

  // The retry re-sends the identical line, id included, so a lost ack cannot
  // turn one finished turn into two notifications (the server deduplicates).
  const line = encodeEvent(event);
  let last = { ok: false, error: 'budget exhausted' };
  for (let attempt = 0; attempt < 2 && !last.ok && remainingMs() > 0; attempt++) {
    last = await deliver(line, remainingMs());
  }
  if (!last.ok) logFailure(last.error, eventName);
  if (isTest) process.stderr.write(last.ok ? 'delivered\n' : `failed: ${last.error}\n`);
  return isTest && !last.ok ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch(() => process.exit(0));
