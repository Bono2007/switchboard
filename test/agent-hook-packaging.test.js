const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { STAGED_FILES } = require('../agent-hooks/install');
const pkg = require('../package.json');

// electron-builder's `files` is a whitelist. "*.js" covers the root only, so a
// new top-level directory is silently left out of app.asar — and the failure is
// invisible until someone runs a packaged build. main.js requires the runtime at
// load time, so a missing directory does not degrade the feature, it stops the
// app from starting at all.
const patterns = pkg.build.files;

/** Does any whitelist pattern cover this repo-relative path? */
function isPackaged(relative) {
  return patterns.some((pattern) => {
    if (pattern === '*.js') return !relative.includes(path.sep) && relative.endsWith('.js');
    const prefix = pattern.replace(/\/\*\*\/\*$/, '');
    return relative === prefix || relative.startsWith(`${prefix}/`);
  });
}

test('every file the hook client needs is inside the packaged app', () => {
  for (const [source] of STAGED_FILES) {
    assert.ok(isPackaged(source), `${source} is not covered by build.files`);
  }
});

test('the modules main.js requires at load time are packaged', () => {
  for (const source of [
    'agent-hooks/runtime.js', 'agent-hooks/status.js', 'agent-hooks/server.js',
    'agent-hooks/install.js', 'agent-hooks/config.js', 'agent-hooks/protocol.js',
    'agent-hooks/dedup.js', 'agent-hooks/socket-path.js',
  ]) {
    assert.ok(isPackaged(source), `${source} is not covered by build.files`);
  }
});

// Guards the matcher itself, so a pattern change cannot make the checks vacuous.
test('the whitelist matcher rejects an uncovered path', () => {
  assert.equal(isPackaged('docs/agent-status-hooks.md'), false);
  assert.equal(isPackaged('test/agent-hook-status.test.js'), false);
  assert.equal(isPackaged('main.js'), true);
});
