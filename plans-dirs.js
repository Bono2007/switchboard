// Resolving where plan files actually live.
//
// Claude Code stores plans in `plansDirectory`, described in its own settings as
// "Custom directory for plan files, relative to project root. If not set,
// defaults to ~/.claude/plans/". So there is no single plans directory: each
// project can point somewhere else, and the shared ~/.claude/plans is only the
// fallback. Reading just the fallback — as Switchboard used to — silently hides
// every plan belonging to a project that configured the setting.
//
// Pure functions only; the filesystem is injected so this is unit-testable.

const path = require('path');

// Claude Code's precedence, narrowest first.
const PROJECT_SETTINGS_FILES = [
  path.join('.claude', 'settings.local.json'),
  path.join('.claude', 'settings.json'),
];

function defaultPlansDir(homeDir) {
  return path.join(homeDir, '.claude', 'plans');
}

// The configured plansDirectory for a project, or null to mean "use the default".
// readJson(filePath) must return a parsed object, or null when absent/unreadable.
function readPlansDirectory(projectPath, homeDir, readJson) {
  for (const rel of PROJECT_SETTINGS_FILES) {
    const settings = readJson(path.join(projectPath, rel));
    const value = settings && settings.plansDirectory;
    if (value && String(value).trim()) return String(value).trim();
  }
  // A user-level plansDirectory still resolves against each project's root.
  const global = readJson(path.join(homeDir, '.claude', 'settings.json'));
  const value = global && global.plansDirectory;
  return value && String(value).trim() ? String(value).trim() : null;
}

// Every directory that may hold plans: the shared default plus one entry per
// project that redirects elsewhere. `project` is null for the shared directory
// and the project's basename otherwise, so the UI can label a plan's origin.
function collectPlansDirs({ homeDir, projectPaths, readJson }) {
  const dirs = [{ dir: defaultPlansDir(homeDir), project: null }];
  const seen = new Set([dirs[0].dir]);

  for (const projectPath of projectPaths || []) {
    if (!projectPath || typeof projectPath !== 'string') continue;
    // Remote projects are ssh://host/dir — their plans are on the other machine.
    if (projectPath.startsWith('ssh://')) continue;
    const configured = readPlansDirectory(projectPath, homeDir, readJson);
    if (!configured) continue;
    const resolved = path.resolve(projectPath, configured);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    dirs.push({ dir: resolved, project: path.basename(projectPath) });
  }
  return dirs;
}

// True when target is dir itself or sits underneath it. Uses path.relative
// rather than startsWith, which would accept /a/plans-evil for a /a/plans check.
function isInside(dir, target) {
  const rel = path.relative(dir, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Path validation for read/save: the file must sit in one of the known plans
// directories. Anything else is rejected, so a compromised renderer cannot walk
// the filesystem through the plans IPC.
function isAllowedPlanPath(target, dirs) {
  const resolved = path.resolve(target);
  return (dirs || []).some(d => isInside(typeof d === 'string' ? d : d.dir, resolved));
}

module.exports = {
  defaultPlansDir,
  readPlansDirectory,
  collectPlansDirs,
  isInside,
  isAllowedPlanPath,
  PROJECT_SETTINGS_FILES,
};
