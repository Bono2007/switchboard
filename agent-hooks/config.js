/**
 * config.js — declare Switchboard's hooks in ~/.claude/settings.json.
 *
 * Reconciliation is declarative rather than "install once": verify that every
 * managed event carries exactly one current entry, repair it in place when it
 * drifts, and never touch a hook we did not write. Running it at every launch
 * is what survives an app move, an upgrade, or a hand-edited settings file.
 *
 * Two Switchboard installs — a dev checkout and /Applications — would otherwise
 * rewrite each other's entry on every launch, forever. So an entry that points
 * at a *different* switchboard-hook binary which still exists on disk is
 * reported as a conflict and left alone. One that points at a binary that is
 * gone is simply stale, and gets replaced.
 *
 * Pure: every function returns new settings, none mutates its argument.
 */
const path = require('path');

// The Claude Code events we subscribe to, and the phase each one means.
// PreToolUse/PostToolUse are deliberately absent: they fire constantly and add
// nothing UserPromptSubmit does not already tell us.
const HOOK_EVENTS = Object.freeze({
  UserPromptSubmit: 'working',   // a turn started
  Notification: 'waiting',       // permission prompt, or idle waiting on input
  Stop: 'finished',              // the turn ended
  SessionEnd: 'finished',        // the CLI exited
});

const BIN_NAME = 'switchboard-hook';

function desiredCommand(bin, event) {
  if (String(bin).includes('"')) {
    throw new Error(`refusing to build a command for a path containing a double quote: ${bin}`);
  }
  return `"${bin}" --event ${event}`;
}

function isManagedCommand(command) {
  return typeof command === 'string' && path.basename(commandBinary(command) || '') === BIN_NAME;
}

/** The executable a hook command runs, quoted or not. */
function commandBinary(command) {
  if (typeof command !== 'string') return '';
  const quoted = command.match(/^\s*"([^"]+)"/);
  if (quoted) return quoted[1];
  return command.trim().split(/\s+/)[0] || '';
}

const groupsOf = (settings, event) => {
  const groups = settings?.hooks?.[event];
  return Array.isArray(groups) ? groups : [];
};

const hooksOf = (group) => (Array.isArray(group?.hooks) ? group.hooks : []);

/**
 * Verify and repair the managed hook entries.
 * @returns {{settings: object, changed: boolean, conflicts: Array<{event: string, command: string}>}}
 */
function reconcile(settings, { bin, pathExists = () => false } = {}) {
  const base = settings && typeof settings === 'object' ? settings : {};
  const conflicts = [];
  const nextHooks = { ...(base.hooks || {}) };
  let changed = false;

  for (const event of Object.keys(HOOK_EVENTS)) {
    const groups = groupsOf(base, event);
    const managed = groups.flatMap(hooksOf).filter((h) => isManagedCommand(h?.command));

    const rival = managed.find((h) => {
      const binary = commandBinary(h.command);
      return binary !== bin && pathExists(binary);
    });
    if (rival) {
      conflicts.push({ event, command: rival.command });
      continue;
    }

    const wanted = desiredCommand(bin, event);
    if (managed.length === 1 && managed[0].command === wanted) continue;

    // Drop every entry of ours, keep every entry that is not, append one current.
    const foreign = groups
      .map((group) => ({ ...group, hooks: hooksOf(group).filter((h) => !isManagedCommand(h?.command)) }))
      .filter((group) => group.hooks.length > 0);

    nextHooks[event] = [...foreign, { hooks: [{ type: 'command', command: wanted }] }];
    changed = true;
  }

  return { settings: changed ? { ...base, hooks: nextHooks } : base, changed, conflicts };
}

/** Remove every entry we own, leaving foreign hooks and empty keys cleaned up. */
function removeManaged(settings) {
  const base = settings && typeof settings === 'object' ? settings : {};
  const nextHooks = {};
  let changed = false;

  for (const [event, groups] of Object.entries(base.hooks || {})) {
    const kept = (Array.isArray(groups) ? groups : [])
      .map((group) => {
        const hooks = hooksOf(group).filter((h) => !isManagedCommand(h?.command));
        if (hooks.length !== hooksOf(group).length) changed = true;
        return { ...group, hooks };
      })
      .filter((group) => group.hooks.length > 0);
    if (kept.length > 0) nextHooks[event] = kept;
  }

  if (!changed) return { settings: base, changed: false };

  const next = { ...base };
  if (Object.keys(nextHooks).length > 0) next.hooks = nextHooks;
  else delete next.hooks;
  return { settings: next, changed: true };
}

module.exports = {
  HOOK_EVENTS, BIN_NAME, desiredCommand, isManagedCommand, commandBinary, reconcile, removeManaged,
};
