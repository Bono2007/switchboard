# Remote SSH sessions, web mode, and status-bar gauges

This build combines three community contributions on top of Switchboard 0.0.30:

| Feature | Upstream PR | Author |
|---|---|---|
| Remote SSH sessions | [#78](https://github.com/doctly/switchboard/pull/78) | HAN-oQo |
| Web server mode | [#28](https://github.com/doctly/switchboard/pull/28) | nandanadileep |
| Context & quota gauges | [#72](https://github.com/doctly/switchboard/pull/72) | Flaykz |

None of them are merged upstream yet. What follows is how to drive each one, and where they overlap.

---

## 1. Remote SSH sessions

Run Claude Code on another machine while browsing, searching and resuming its sessions from your local Switchboard window. Transcripts are read over SSH and **never copied to your disk**.

### Adding your first remote project

1. **Add Project** → switch from the **Local folder** tab to **Remote (SSH)**.
2. Pick a host. Entries in `~/.ssh/config` are imported automatically — you should see them already listed.
3. Set the remote directory, either by typing a path (`~/path/to/project`) or with **Browse**, which walks the remote filesystem the same way the local folder picker does.
4. Confirm. The project appears in the sidebar with an `SSH` badge, and its `+` button launches Claude or a shell on that host.

### Connecting and authentication

Use **Connect** on a host (Settings → *Remote Hosts (SSH)*) before browsing. It opens a real shell to the host, which:

- verifies reachability and authenticates,
- warms the shared connection so `Browse` and session listing respond immediately.

A popup appears **only** when the host actually needs input — a password, a key passphrase, or a first-time host-key confirmation. Otherwise the button just goes green.

Authentication uses your SSH agent and keys. **Passwords are never stored.** Connections are multiplexed via `ControlMaster=auto` with `ControlPersist=600`, so you authenticate once per host and subsequent operations reuse the socket for ten minutes.

### Managing hosts

Settings → **Remote Hosts (SSH)**:

- Hosts from `~/.ssh/config` are listed read-only, with **Connect** and **Test**.
- **Add Host** defines a manual host: label, user, hostname, port, identity file (`-i`), and extra `-o` options.
- A manual host can be written back to `~/.ssh/config` if you want it available outside Switchboard.
- **Test** runs a non-interactive probe (`BatchMode`, short timeout, no PTY) and reports reachable / auth failure / host-key problem / unreachable.

### Past sessions, search and resume

Once a host is connected, its existing sessions are indexed — metadata only, over the same SSH connection. They then:

- persist in the sidebar, grouped by remote directory and auto-discovered from each session's `cwd`,
- show up in full-text search alongside your local sessions,
- resume and fork in a terminal **on the host**,
- stream live over SSH under *View messages*.

Use the ⟳ button on a host group to re-sync after working on that machine outside Switchboard.

### IDE integration over SSH (off by default)

A remote Claude session can't reach Switchboard's local IDE MCP server, since that's a loopback WebSocket. Enabling this reverse-forwards the local IDE port to the remote host (`ssh -R`), writes an IDE lock file there so the remote `claude --ide` discovers it, and routes `openDiff` / `openFile` back to your local side panel.

Settings → **IDE integration over SSH**.

> **Security.** This exposes your local IDE port on the remote host. It's protected by a per-session token, but enable it only for hosts you trust. Off by default; applies to new remote sessions only.

---

## 2. Web server mode

Serves the Switchboard UI over HTTP + WebSocket so you can use it from any browser — no Electron window, no desktop environment on the host.

### Starting it

```bash
npm run web                                  # 127.0.0.1:3000, token generated at startup
npm run web -- --port 8080                   # custom port
npm run web -- --port 8080 --host 0.0.0.0    # reachable from the LAN
```

The token is printed at startup:

```
  Switchboard web server running
  URL:   http://127.0.0.1:3000
  Token: 9f3c1a...

  Open the URL in your browser. When prompted, enter the token above.
  Or append ?token=<token> to the URL to authenticate automatically.
```

Every setting takes a CLI flag or an environment variable, flag winning:

| Flag | Variable | Default |
|---|---|---|
| `--port` | `SWITCHBOARD_PORT` | `3000` |
| `--host` | `SWITCHBOARD_HOST` | `127.0.0.1` |
| `--token` | `SWITCHBOARD_TOKEN` | random 24 bytes, regenerated each start |

Set `--token` yourself if you want a stable URL across restarts. The browser caches it in `localStorage`, so you only paste it once per device.

### Why `npm run web` runs under Electron

`better-sqlite3` and `node-pty` in this repo are compiled for **Electron's** ABI, not your system Node's. Plain `node web-server.js` therefore dies with `ERR_DLOPEN_FAILED`. The `web` script runs the server under `ELECTRON_RUN_AS_NODE=1 electron`, which is Electron used purely as a Node runtime — no window, no GUI — so the ABI matches.

For a genuinely Electron-free deployment, rebuild the native modules for your Node and use the other script:

```bash
npm rebuild better-sqlite3 node-pty
npm run web:node
```

Note that this breaks the desktop app until you run `node scripts/postinstall.js` again — the two ABIs are mutually exclusive in one `node_modules`.

### How it works

A single `web-server.js` entry point serves `public/` as static files, exposes handler logic behind `POST /api/invoke`, and opens a WebSocket on the same port for terminal I/O and push events. Browser-side, `public/web-api.js` reimplements the exact `window.api` interface using `fetch` + WebSocket, and no-ops under Electron where the preload already provided it. No new runtime dependencies — Node's `http` plus the `ws` package that was already there.

### Security

`--host 0.0.0.0` puts a terminal that can spawn arbitrary processes on your network, behind nothing but a bearer token over **plain HTTP**. Bind to `127.0.0.1` and reach it through an SSH tunnel or a TLS-terminating reverse proxy:

```bash
ssh -L 3000:127.0.0.1:3000 you@host
```

### What is not available in web mode

| Feature | Behaviour |
|---|---|
| Remote SSH sessions | Reports "no remote hosts"; the mutating calls fail with an explicit error |
| Native folder picker | `Browse` returns nothing — type paths manually |
| Auto-updater | Reports "not available" |
| File drag-and-drop into the terminal | No path resolution in a browser |

The remote-SSH gap is a deliberate limitation of this integration, not a bug: the interactive connect flow streams password and passphrase prompts over Electron IPC and has no WebSocket equivalent yet. The stubs fail loudly rather than silently, so it's obvious what's happening.

Context and quota gauges **do** work in web mode.

---

## 3. Context and quota gauges

Two indicators in the status bar, so you can judge whether to keep going in a session or start a fresh one without opening the Stats view.

**Context gauge** — how full the active session's context window is, out of 200K tokens. It reads the newest assistant `usage` entry from that session's transcript and sums `input_tokens`, `cache_read_input_tokens` and `cache_creation_input_tokens`. Hover for the exact figure. The bar changes colour at 60% and again at 80%. Refreshes when a session becomes active and when Claude finishes responding.

**Quota gauge** — your 5-hour quota usage, from the same data as the Stats tab. Click it to jump there. Refreshes every 5 minutes.

Both stay hidden when there's no data — a brand-new session with no assistant reply yet shows nothing, which is expected rather than broken.

---

## Verifying the build

```bash
npm test                    # 69 tests
npm run bundle:codemirror
npm start                   # desktop app
npm run web -- --port 3999  # web mode
```

Checked on macOS (Apple Silicon, Electron 41):

- All 69 tests pass, including the 40-odd added by the remote-SSH work.
- Web mode serves the UI, rejects unauthenticated calls with 401, and answers `/api/invoke`.
- Both gauges render; the context gauge returns real values in web mode as well as Electron.
- `~/.ssh/config` hosts are imported automatically and listed in settings.

The remote SSH **session** flow — connecting, indexing and resuming on a real host — has not been exercised end to end here; only host discovery and the unit-tested command builders. Try it against a host you control before relying on it.
