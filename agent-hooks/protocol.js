/**
 * protocol.js — the wire format between a Claude Code hook and Switchboard.
 *
 * Shared by both ends: the hook client (bin/switchboard-hook.js) builds and
 * encodes, the main process parses. One newline-delimited JSON object per
 * event, acknowledged by the server.
 *
 *   {"v":1,"kind":"agent_event","id":"…","provider":"claude_hook","paneId":"…",
 *    "sessionId":"…","phase":"finished","title":"Claude Code","body":"Done",
 *    "pids":[],"ts":1721234567,"test":false}
 *
 * Two identifiers, because they drift apart. `paneId` is the id Switchboard
 * launched the session under, exported as SWITCHBOARD_SESSION_ID — stable for
 * the life of the pane, and the key into activeSessions. `sessionId` is the id
 * the CLI reports for its *current* session, which changes on a fork or a
 * compact. Prefer the pane, fall back to the CLI, fall back to the pid chain.
 *
 * `id` identifies one logical event. The client generates it once and re-sends
 * the identical line on every retry, so the server can suppress duplicates
 * (see dedup.js) instead of posting the same notification twice.
 *
 * A hook runs inside the agent's own turn, so nothing here may be expensive or
 * throw across the socket: parseEvent returns a verdict, it never raises.
 */
const PROTOCOL_VERSION = 1;
const KIND_EVENT = 'agent_event';
const KIND_ACK = 'ack';

// finished maps to "idle" on the Switchboard side; the wire keeps the CLI's
// own vocabulary so the mapping lives in exactly one place (status.js).
const PHASES = Object.freeze(['working', 'waiting', 'finished']);

const MAX_TEXT = 200;
const MAX_LINE_BYTES = 1024 * 1024;

// Session ids come from the CLI (`--session-id`), so they are UUID-shaped in
// practice. Constrain them anyway: this value is used as a map key and echoed
// into IPC and log lines.
const SESSION_ID_RE = /^[\w.:-]{1,128}$/;

const text = (value) => (typeof value === 'string' ? value.slice(0, MAX_TEXT) : '');

const pidList = (value) =>
  Array.isArray(value) ? value.filter((n) => Number.isInteger(n) && n > 0).slice(0, 32) : [];

/**
 * Build a validated event. Throws on programmer error — the client controls
 * every input, so a bad event here is a bug, not untrusted data.
 */
function buildEvent({ id, paneId, sessionId, provider, phase, title, body, pids, ts, test } = {}) {
  if (!PHASES.includes(phase)) {
    throw new Error(`invalid phase: ${phase}`);
  }
  const pane = typeof paneId === 'string' && paneId ? paneId : null;
  const session = typeof sessionId === 'string' && sessionId ? sessionId : null;
  const processes = pidList(pids);
  if (!pane && !session && processes.length === 0) {
    throw new Error('an event needs a paneId, a sessionId or a non-empty pids chain');
  }
  for (const [label, value] of [['paneId', pane], ['sessionId', session]]) {
    if (value && !SESSION_ID_RE.test(value)) throw new Error(`invalid ${label}: ${value}`);
  }
  return Object.freeze({
    v: PROTOCOL_VERSION,
    kind: KIND_EVENT,
    id: typeof id === 'string' ? id.slice(0, 64) : '',
    provider: String(provider || ''),
    paneId: pane,
    sessionId: session,
    phase,
    title: text(title),
    body: text(body),
    pids: Object.freeze(processes),
    ts: Number.isFinite(ts) ? ts : 0,
    test: test === true,
  });
}

function encodeEvent(event) {
  return `${JSON.stringify(event)}\n`;
}

/**
 * Parse one line from the socket.
 * @returns {{ok: true, event: object} | {ok: false, error: string}}
 */
function parseEvent(line) {
  if (typeof line !== 'string') return { ok: false, error: 'not a string' };
  if (Buffer.byteLength(line, 'utf8') > MAX_LINE_BYTES) return { ok: false, error: 'line too long' };

  let raw;
  try {
    raw = JSON.parse(line);
  } catch {
    return { ok: false, error: 'malformed JSON' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'payload is not an object' };
  }
  if (raw.v !== PROTOCOL_VERSION) return { ok: false, error: `unsupported version: ${raw.v}` };
  if (raw.kind !== KIND_EVENT) return { ok: false, error: `unsupported kind: ${raw.kind}` };
  if (typeof raw.provider !== 'string' || !raw.provider) return { ok: false, error: 'empty provider' };
  if (!PHASES.includes(raw.phase)) return { ok: false, error: `invalid phase: ${raw.phase}` };

  const pane = typeof raw.paneId === 'string' && raw.paneId ? raw.paneId : null;
  const session = typeof raw.sessionId === 'string' && raw.sessionId ? raw.sessionId : null;
  if (pane && !SESSION_ID_RE.test(pane)) return { ok: false, error: 'invalid paneId' };
  if (session && !SESSION_ID_RE.test(session)) return { ok: false, error: 'invalid sessionId' };
  const processes = pidList(raw.pids);
  if (!pane && !session && processes.length === 0) return { ok: false, error: 'no target' };

  return {
    ok: true,
    event: Object.freeze({
      v: PROTOCOL_VERSION,
      kind: KIND_EVENT,
      id: typeof raw.id === 'string' ? raw.id.slice(0, 64) : '',
      provider: raw.provider,
      paneId: pane,
      sessionId: session,
      phase: raw.phase,
      title: text(raw.title),
      body: text(raw.body),
      pids: Object.freeze(processes),
      ts: Number.isFinite(raw.ts) ? raw.ts : 0,
      test: raw.test === true,
    }),
  };
}

function buildAck(ok) {
  return `${JSON.stringify({ v: PROTOCOL_VERSION, kind: KIND_ACK, ok: ok !== false })}\n`;
}

/** @returns {{ok: boolean} | null} — null when the line is not an ack at all. */
function parseAck(line) {
  try {
    const raw = JSON.parse(line);
    if (!raw || raw.v !== PROTOCOL_VERSION || raw.kind !== KIND_ACK) return null;
    return { ok: raw.ok === true };
  } catch {
    return null;
  }
}

module.exports = {
  PROTOCOL_VERSION, KIND_EVENT, KIND_ACK, PHASES, MAX_TEXT, MAX_LINE_BYTES,
  buildEvent, encodeEvent, parseEvent, buildAck, parseAck,
};
