const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const {
  defaultPlansDir, readPlansDirectory, collectPlansDirs, isInside, isAllowedPlanPath,
} = require('../plans-dirs');

const HOME = path.join(path.sep, 'home', 'u');
const DEFAULT = path.join(HOME, '.claude', 'plans');

// Builds a readJson stub from a { '<path>': object } map.
const reader = (files) => (p) => (Object.prototype.hasOwnProperty.call(files, p) ? files[p] : null);

// --- readPlansDirectory ---

test('readPlansDirectory returns null when nothing configures it', () => {
  assert.equal(readPlansDirectory('/p', HOME, reader({})), null);
});

test('readPlansDirectory reads the project settings file', () => {
  const files = { [path.join('/p', '.claude', 'settings.json')]: { plansDirectory: '.claude/plans' } };
  assert.equal(readPlansDirectory('/p', HOME, reader(files)), '.claude/plans');
});

test('readPlansDirectory lets settings.local.json win over settings.json', () => {
  const files = {
    [path.join('/p', '.claude', 'settings.local.json')]: { plansDirectory: 'local-plans' },
    [path.join('/p', '.claude', 'settings.json')]: { plansDirectory: 'shared-plans' },
  };
  assert.equal(readPlansDirectory('/p', HOME, reader(files)), 'local-plans');
});

test('readPlansDirectory falls back to the user-level setting', () => {
  const files = { [path.join(HOME, '.claude', 'settings.json')]: { plansDirectory: 'docs/plans' } };
  assert.equal(readPlansDirectory('/p', HOME, reader(files)), 'docs/plans');
});

test('readPlansDirectory lets a project override the user-level setting', () => {
  const files = {
    [path.join(HOME, '.claude', 'settings.json')]: { plansDirectory: 'docs/plans' },
    [path.join('/p', '.claude', 'settings.json')]: { plansDirectory: '.claude/plans' },
  };
  assert.equal(readPlansDirectory('/p', HOME, reader(files)), '.claude/plans');
});

test('readPlansDirectory ignores blank values', () => {
  const files = { [path.join('/p', '.claude', 'settings.json')]: { plansDirectory: '   ' } };
  assert.equal(readPlansDirectory('/p', HOME, reader(files)), null);
});

// --- collectPlansDirs ---

test('collectPlansDirs always includes the shared default first', () => {
  const dirs = collectPlansDirs({ homeDir: HOME, projectPaths: [], readJson: reader({}) });
  assert.deepEqual(dirs, [{ dir: DEFAULT, project: null }]);
});

test('collectPlansDirs adds a project directory resolved against its root', () => {
  const proj = path.join(path.sep, 'w', 'barometre');
  const files = { [path.join(proj, '.claude', 'settings.json')]: { plansDirectory: '.claude/plans' } };
  const dirs = collectPlansDirs({ homeDir: HOME, projectPaths: [proj], readJson: reader(files) });
  assert.deepEqual(dirs, [
    { dir: DEFAULT, project: null },
    { dir: path.join(proj, '.claude', 'plans'), project: 'barometre' },
  ]);
});

test('collectPlansDirs skips projects that use the default', () => {
  const dirs = collectPlansDirs({ homeDir: HOME, projectPaths: ['/w/a', '/w/b'], readJson: reader({}) });
  assert.equal(dirs.length, 1);
});

test('collectPlansDirs de-duplicates directories shared by several projects', () => {
  // A user-level setting pointing at an absolute path resolves identically for
  // every project, and must not be listed once per project.
  const files = { [path.join(HOME, '.claude', 'settings.json')]: { plansDirectory: '/shared/plans' } };
  const dirs = collectPlansDirs({ homeDir: HOME, projectPaths: ['/w/a', '/w/b'], readJson: reader(files) });
  assert.equal(dirs.length, 2);
  assert.equal(dirs[1].dir, path.resolve('/shared/plans'));
});

test('collectPlansDirs ignores remote projects', () => {
  const dirs = collectPlansDirs({ homeDir: HOME, projectPaths: ['ssh://host/~/p'], readJson: reader({}) });
  assert.deepEqual(dirs, [{ dir: DEFAULT, project: null }]);
});

test('collectPlansDirs tolerates junk in the project list', () => {
  const dirs = collectPlansDirs({ homeDir: HOME, projectPaths: [null, '', 42], readJson: reader({}) });
  assert.deepEqual(dirs, [{ dir: DEFAULT, project: null }]);
});

// --- conventional locations (superpowers etc.) ---

test('collectPlansDirs picks up docs/superpowers/plans when it exists', () => {
  // The superpowers writing-plans skill saves there and never sets
  // plansDirectory, so setting-only discovery misses every plan it wrote.
  const proj = path.join(path.sep, 'w', 'barometre');
  const sp = path.join(proj, 'docs', 'superpowers', 'plans');
  const dirs = collectPlansDirs({
    homeDir: HOME, projectPaths: [proj], readJson: reader({}), dirExists: (d) => d === sp,
  });
  assert.deepEqual(dirs, [
    { dir: DEFAULT, project: null },
    { dir: sp, project: 'barometre' },
  ]);
});

test('collectPlansDirs picks up docs/plans when it exists', () => {
  const proj = path.join(path.sep, 'w', 'agentops');
  const dp = path.join(proj, 'docs', 'plans');
  const dirs = collectPlansDirs({
    homeDir: HOME, projectPaths: [proj], readJson: reader({}), dirExists: (d) => d === dp,
  });
  assert.equal(dirs.length, 2);
  assert.deepEqual(dirs[1], { dir: dp, project: 'agentops' });
});

test('collectPlansDirs skips conventional directories that do not exist', () => {
  const dirs = collectPlansDirs({
    homeDir: HOME, projectPaths: ['/w/a'], readJson: reader({}), dirExists: () => false,
  });
  assert.deepEqual(dirs, [{ dir: DEFAULT, project: null }]);
});

test('collectPlansDirs keeps both the configured and the conventional directory', () => {
  const proj = path.join(path.sep, 'w', 'barometre');
  const configured = path.join(proj, '.claude', 'plans');
  const sp = path.join(proj, 'docs', 'superpowers', 'plans');
  const files = { [path.join(proj, '.claude', 'settings.json')]: { plansDirectory: '.claude/plans' } };
  const dirs = collectPlansDirs({
    homeDir: HOME, projectPaths: [proj], readJson: reader(files), dirExists: (d) => d === sp,
  });
  assert.deepEqual(dirs.map(d => d.dir), [DEFAULT, configured, sp]);
});

test('collectPlansDirs does not probe conventional locations without dirExists', () => {
  const dirs = collectPlansDirs({ homeDir: HOME, projectPaths: ['/w/a'], readJson: reader({}) });
  assert.deepEqual(dirs, [{ dir: DEFAULT, project: null }]);
});

test('collectPlansDirs never duplicates a directory reachable two ways', () => {
  // plansDirectory pointing at the conventional location must not list it twice.
  const proj = path.join(path.sep, 'w', 'p');
  const sp = path.join(proj, 'docs', 'superpowers', 'plans');
  const files = { [path.join(proj, '.claude', 'settings.json')]: { plansDirectory: 'docs/superpowers/plans' } };
  const dirs = collectPlansDirs({
    homeDir: HOME, projectPaths: [proj], readJson: reader(files), dirExists: (d) => d === sp,
  });
  assert.deepEqual(dirs.map(d => d.dir), [DEFAULT, sp]);
});

// --- path validation ---

test('isInside accepts the directory itself and its descendants', () => {
  assert.ok(isInside('/a/plans', '/a/plans'));
  assert.ok(isInside('/a/plans', '/a/plans/x.md'));
  assert.ok(isInside('/a/plans', '/a/plans/deep/x.md'));
});

test('isInside rejects the startsWith prefix trap', () => {
  // The old check was resolved.startsWith(PLANS_DIR), which let this through.
  assert.equal(isInside('/a/plans', '/a/plans-evil/x.md'), false);
});

test('isInside rejects traversal back out of the directory', () => {
  assert.equal(isInside('/a/plans', '/a/plans/../../etc/passwd'), false);
  assert.equal(isInside('/a/plans', '/etc/passwd'), false);
});

test('isAllowedPlanPath accepts a file in any known directory', () => {
  const dirs = [{ dir: '/a/plans', project: null }, { dir: '/w/p/.claude/plans', project: 'p' }];
  assert.ok(isAllowedPlanPath('/w/p/.claude/plans/x.md', dirs));
  assert.ok(isAllowedPlanPath('/a/plans/y.md', dirs));
});

test('isAllowedPlanPath rejects anything outside every known directory', () => {
  const dirs = [{ dir: '/a/plans', project: null }];
  assert.equal(isAllowedPlanPath('/a/plans/../secret.md', dirs), false);
  assert.equal(isAllowedPlanPath('/etc/passwd', dirs), false);
  assert.equal(isAllowedPlanPath('/a/plans-evil/x.md', dirs), false);
});

test('isAllowedPlanPath accepts plain directory strings as well as entries', () => {
  assert.ok(isAllowedPlanPath('/a/plans/x.md', ['/a/plans']));
});

test('defaultPlansDir points at the shared Claude Code location', () => {
  assert.equal(defaultPlansDir(HOME), path.join(HOME, '.claude', 'plans'));
});
