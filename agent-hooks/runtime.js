/**
 * runtime.js — wires the hook socket, the status machine and the app together.
 *
 * Kept out of main.js so the moving parts stay testable and main.js only has to
 * say "here is how to reach a session, here is how to talk to the renderer".
 *
 * Status changes are published on the two channels the renderer already speaks,
 * so the sidebar needed no changes: hooks simply became a better source for the
 * signal it was already reacting to.
 */
const fs = require('fs');
const path = require('path');

const { createAgentStatus } = require('./status');
const { createHookServer } = require('./server');
const install = require('./install');

const ATTENTION_FALLBACK = 'Claude Code needs your attention';

/** Signal 0 asks the kernel whether a pid exists without touching it. */
function defaultIsProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

/**
 * @param {object} opts
 * @param {string} opts.dataDir       where the socket and staged hook live
 * @param {string} opts.appDir        the app root the client is copied from
 * @param {string} opts.electronPath  fallback runtime for the shim
 * @param {string} opts.settingsPath  the Claude Code settings file to reconcile
 * @param {(channel: string, ...args: any[]) => void} opts.send   to the renderer
 * @param {(event: object) => string|null} opts.resolveSession    event → session id
 */
function createAgentHookRuntime({
  dataDir, appDir, electronPath, settingsPath,
  send, resolveSession, log = console,
  isProcessAlive = defaultIsProcessAlive,
}) {
  const socketPath = install.socketPathFor(dataDir);
  const health = {
    socketPath, bin: install.hookBin(dataDir),
    listening: false, installed: false, conflicts: [], lastEventAt: null, lastError: null,
  };

  const status = createAgentStatus({
    isProcessAlive,
    onChange(sessionId, change) {
      log.debug?.(`[hooks] ${sessionId} ${change.previous} → ${change.status} (${change.source})`);
      send('cli-busy-state', sessionId, change.status === 'working');
      if (change.status === 'waiting') {
        send('terminal-notification', sessionId, change.message || ATTENTION_FALLBACK);
      }
    },
  });

  const server = createHookServer({
    socketPath,
    log,
    onEvent(event) {
      health.lastEventAt = Date.now();
      // Logged on receipt, not on change: an event that confirms the status we
      // already had is exactly the one you need to see when a hook looks dead.
      log.debug?.(`[hooks] recv ${event.phase} pane=${event.paneId} session=${event.sessionId}`);
      // The Test button proves the delivery path end to end; it must never
      // move a real session's status.
      if (event.test) {
        log.info('[hooks] test event received');
        return;
      }
      const sessionId = resolveSession(event);
      if (!sessionId) {
        log.debug?.(`[hooks] no session for pane=${event.paneId} session=${event.sessionId}`);
        return;
      }
      status.applyHook(sessionId, event.phase, {
        ts: event.ts,
        message: event.body || ATTENTION_FALLBACK,
      });
    },
  });

  async function start() {
    try {
      install.stage({ dataDir, appDir, electronPath });
      const result = install.reconcileSettings({ settingsPath, bin: health.bin });
      health.conflicts = result.conflicts;
      health.installed = install.isInstalled({ settingsPath, bin: health.bin });
      if (result.repaired) log.info('[hooks] repaired Claude Code settings');
      for (const conflict of result.conflicts) {
        log.warn(`[hooks] ${conflict.event} is owned by another install: ${conflict.command}`);
      }
    } catch (err) {
      health.lastError = `install: ${err.message}`;
      log.error(`[hooks] install failed: ${err.message}`);
    }

    try {
      await server.start();
      health.listening = true;
    } catch (err) {
      health.lastError = `listen: ${err.message}`;
      log.error(`[hooks] ${err.message}`);
    }
    return health;
  }

  /** Environment a spawned session needs so its hooks can find us. */
  function sessionEnv(sessionId) {
    return { SWITCHBOARD_SESSION_ID: sessionId, SWITCHBOARD_HOOK_SOCK: socketPath };
  }

  function readLog() {
    try {
      return fs.readFileSync(path.join(dataDir, 'hooks.log'), 'utf8').split('\n').slice(-50).join('\n');
    } catch {
      return '';
    }
  }

  return Object.freeze({
    start,
    close: () => { server.close(); health.listening = false; },
    sessionEnv,
    socketPath,
    status,
    health: () => ({ ...health, sessions: status.snapshot() }),
    readLog,
    refresh: () => {
      install.stage({ dataDir, appDir, electronPath });
      const result = install.reconcileSettings({ settingsPath, bin: health.bin });
      health.conflicts = result.conflicts;
      health.installed = install.isInstalled({ settingsPath, bin: health.bin });
      return { ...health };
    },
    uninstall: () => {
      const result = install.uninstallSettings({ settingsPath });
      health.installed = false;
      return result;
    },
  });
}

module.exports = { createAgentHookRuntime, defaultIsProcessAlive, ATTENTION_FALLBACK };
