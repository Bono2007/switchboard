/**
 * status.js — one status per session, from two sources of truth.
 *
 * Hooks are authoritative. They report the exact lifecycle phase, so a hook
 * event applies immediately and cancels anything the other source scheduled.
 *
 * Detection — Switchboard reading the OSC 0 title the CLI writes — is the
 * fallback. It notices that an agent stopped being busy, but not why, and it
 * breaks whenever the CLI changes its spinner. So once a session has proven it
 * is hooked, a detected *idle* no longer applies directly: it opens a grace
 * window and a hook arriving inside that window always wins.
 *
 * The two windows are deliberately asymmetric:
 *
 *   working (4s)   the turn most likely just ended; a Stop hook is imminent.
 *   waiting (30s)  the agent is sitting on your answer with a live process.
 *                  Idling it would clear the badge that tells you to answer,
 *                  so at the end of the window we idle only if the process is
 *                  actually gone — which is how a killed agent gets recovered,
 *                  since its Stop hook never ran.
 *
 * Detected *activity* is always trusted upward: it can only ever mean an agent
 * is running, never that one stopped.
 *
 * Every dependency is injected so the whole machine is testable without a clock.
 */
const WORKING_GRACE_MS = 4000;
const WAITING_GRACE_MS = 30000;

const IDLE = 'idle';

// The wire speaks the CLI's vocabulary; Switchboard speaks in statuses.
const PHASE_TO_STATUS = Object.freeze({
  working: 'working',
  waiting: 'waiting',
  finished: IDLE,
});

function createAgentStatus({
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  isProcessAlive = () => false,
  onChange = () => {},
  workingGraceMs = WORKING_GRACE_MS,
  waitingGraceMs = WAITING_GRACE_MS,
} = {}) {
  /** @type {Map<string, {status: string, hooked: boolean, pid: number|null, lastEventAt: number|null, timer: any}>} */
  const sessions = new Map();

  const get = (id) => sessions.get(id) || null;

  function cancelTimer(entry) {
    if (entry && entry.timer !== null) {
      clearTimer(entry.timer);
      return { ...entry, timer: null };
    }
    return entry;
  }

  /** Replace an entry, emitting only on a real status change. */
  function commit(id, entry, source) {
    const previous = sessions.get(id)?.status || IDLE;
    sessions.set(id, entry);
    if (entry.status !== previous) {
      onChange(id, { status: entry.status, previous, source, message: entry.message });
    }
  }

  function ensure(id) {
    return get(id)
      || { status: IDLE, hooked: false, pid: null, lastEventAt: null, message: null, timer: null };
  }

  function applyHook(id, phase, { pid = null, ts = null, message = null } = {}) {
    const status = PHASE_TO_STATUS[phase];
    if (!status) return;

    // A late Stop for a pane that already closed must not recreate it.
    if (status === IDLE && !sessions.has(id)) return;

    const base = cancelTimer(ensure(id));
    commit(id, {
      ...base,
      status,
      hooked: true,
      pid: pid !== null ? pid : base.pid,
      lastEventAt: ts !== null ? ts : base.lastEventAt,
      // Only the hook that raised this status carries a message worth showing.
      message: status === 'waiting' ? message : null,
      timer: null,
    }, 'hook');
  }

  function scheduleIdleCheck(id) {
    const entry = get(id);
    if (!entry) return;
    const delay = entry.status === 'waiting' ? waitingGraceMs : workingGraceMs;
    const timer = setTimer(() => onGraceExpired(id), delay);
    sessions.set(id, { ...entry, timer });
  }

  function onGraceExpired(id) {
    const entry = get(id);
    if (!entry) return;
    const cleared = { ...entry, timer: null };
    sessions.set(id, cleared);

    // A waiting agent with a live process is genuinely waiting: check again
    // later rather than cutting it short.
    if (cleared.status === 'waiting' && cleared.pid && isProcessAlive(cleared.pid)) {
      scheduleIdleCheck(id);
      return;
    }
    commit(id, { ...cleared, status: IDLE }, 'detection');
  }

  function applyDetection(id, { busy } = {}) {
    if (busy) {
      const base = cancelTimer(ensure(id));
      commit(id, { ...base, status: 'working', timer: null }, 'detection');
      return;
    }

    const entry = get(id);
    if (!entry || entry.status === IDLE) return;

    if (!entry.hooked) {
      // Nothing better is coming — this is the only signal we have.
      commit(id, { ...cancelTimer(entry), status: IDLE, timer: null }, 'detection');
      return;
    }
    sessions.set(id, cancelTimer(entry));
    scheduleIdleCheck(id);
  }

  function endSession(id) {
    const entry = get(id);
    if (!entry) return;
    cancelTimer(entry);
    if (entry.status !== IDLE) {
      onChange(id, { status: IDLE, previous: entry.status, source: 'session-end' });
    }
    sessions.delete(id);
  }

  return Object.freeze({
    applyHook,
    applyDetection,
    endSession,
    status: (id) => get(id)?.status || IDLE,
    isHooked: (id) => get(id)?.hooked === true,
    lastEventAt: (id) => (get(id) ? get(id).lastEventAt : null),
    snapshot: () => [...sessions.entries()].map(([sessionId, e]) => ({
      sessionId, status: e.status, hooked: e.hooked, pid: e.pid, lastEventAt: e.lastEventAt,
    })),
  });
}

module.exports = { createAgentStatus, WORKING_GRACE_MS, WAITING_GRACE_MS, PHASE_TO_STATUS };
