# Switchboard — fork Bono2007

> Fork personnel de [doctly/switchboard](https://github.com/doctly/switchboard).
> Le reste de ce README décrit l'application telle que l'amont la documente ;
> cette section décrit ce qui diffère ici.

Le travail est développé sur
[`feature/remote-web-gauges`](https://github.com/Bono2007/switchboard/tree/feature/remote-web-gauges)
puis fusionné ici. `main` diverge donc de l'amont — c'est délibéré, et c'est de
ce code qu'est construite la release.

## Ce que ce fork ajoute

**Statut des sessions par hooks.** L'amont devine l'activité d'une session en
lisant le titre du terminal. Ici, Claude Code la signale lui-même via un hook
installé dans `~/.claude/settings.json`, et le titre n'est plus qu'un repli.
Voir [`docs/agent-status-hooks.md`](docs/agent-status-hooks.md).

**Quatre pull requests amont intégrées** — #78 (sessions SSH distantes), #28
(mode web), #72 (jauges de contexte et de quota dans la barre d'état), #58
(bannière de sortie). Plus les correctifs d'intégration nécessaires pour
qu'elles cohabitent. Voir [`docs/remote-web-gauges.md`](docs/remote-web-gauges.md).

**Traduction française** de l'interface, suivant la langue du système.

**Infobulles applicatives**, les `title` natifs ne s'affichant pas de façon
fiable sous Chromium.

**Onglet Plans réparé** — respect du réglage `plansDirectory` par projet, et
découverte des plans du plugin superpowers (`docs/superpowers/plans/`).

**Sélection de texte sous macOS** dans les sessions qui activent le suivi de
souris. Seul changement proposé en amont, dans la
[PR #81](https://github.com/doctly/switchboard/pull/81).

## Installation

**[Télécharger la dernière version](https://github.com/Bono2007/switchboard/releases/latest)**
— macOS Apple Silicon uniquement.

Le build n'est **ni signé par un identifiant Apple, ni notarisé**. Si Gatekeeper
refuse de l'ouvrir : clic droit → Ouvrir.

## Construire soi-même

```bash
npm install
npm run bundle:codemirror
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg zip --arm64 \
  -c.mac.notarize=false -c.publish.owner=Bono2007
```

Les deux dernières options ne sont **pas** dans `package.json`, volontairement :
la branche doit rester proposable en amont, et une redirection du canal de mise
à jour inscrite dans le dépôt en serait une mauvaise surprise.

## Mises à jour et CI

L'auto-updater du build pointe sur ce dépôt, jamais sur celui de l'amont —
sinon la prochaine version de doctly écraserait silencieusement tout ce qui
précède, `autoDownload` et `autoInstallOnAppQuit` étant tous deux actifs.

GitHub Actions est **désactivé** sur ce fork : le workflow hérité exige les
secrets de signature Apple de doctly et échoue sans eux. Les releases sont
publiées à la main.

---

Your command center for Claude Code sessions.

Switchboard is a desktop app that gives you a unified view of all your Claude Code sessions across every project. Launch, resume, fork, and monitor sessions from a single window — no more juggling terminal tabs or digging through `~/.claude/projects` to find that one conversation from last week.

![Switchboard](build/screenshot.png)

### Key Features

- **Session Browser** — All your Claude Code sessions, organized by project, searchable by content
- **Built-in Terminal** — Connect to running sessions or launch new ones without leaving the app
- **Status Notifications** — In-app alerts when a session is waiting for permission approval or user input
- **Fork & Resume** — Branch off from any point in a session's history
- **Full-Text Search** — Find any session by what was discussed, not just when it happened
- **IDE Emulation** — Switchboard acts as an IDE for Claude CLI, showing file diffs and opens in a side panel where you can accept, reject, or edit changes before they're applied. Supports both inline and side-by-side diff views. Disable this in Global Settings if you prefer Claude to use your own editor (VS Code, Cursor, etc.)
- **Plans & Memory** — Browse and edit your plan files and CLAUDE.md memory in one place
- **Activity Stats** — Heatmap of your coding activity across all projects
- **Session Names** — Picks up session names from Claude Code's `/rename` command automatically

## Session Grid Overview

Toggle the grid overview from the sidebar for a bird's-eye view of all your open sessions at once, grouped by project.

![Session Grid Overview](build/screenshot-grid.png)

- **Live terminals** — Every open session renders its full terminal in a card, so you can monitor multiple Claude agents simultaneously.
- **Status at a glance** — Each card shows a running/stopped/busy indicator dot and last-activity timestamp.
- **Click to focus, double-click to expand** — Click a card header to focus it; double-click to switch back to single-terminal view for that session.
- **Persistent** — Grid preference is saved across restarts.

## File Preview Side Panel & Claude IDE MCP Emulator

Switchboard can act as an IDE for your Claude Code sessions. When enabled, Claude's file opens and proposed edits appear in a side panel next to the terminal instead of being sent to an external editor.

![IDE Emulation](build/screenshot-ide.png)

- **Diff review** — When Claude proposes a file change, it shows up as a diff in the side panel. You can review the changes and accept or reject them directly.
- **Inline & side-by-side** — Toggle between inline (unified) and side-by-side diff views. Your preference is remembered across sessions.
- **Partial acceptance** — In inline mode, you can accept or reject individual chunks within a diff, then submit the final result.
- **File viewer** — Clickable file links in terminal output (OSC 8 hyperlinks) open in the side panel with syntax highlighting.

To disable IDE emulation entirely (e.g. if you want Claude to use VS Code or Cursor instead), uncheck **IDE Emulation** in **Global Settings**. This stops Switchboard from registering as an IDE, so Claude CLI will discover and connect to your real editor. Changes take effect on new sessions — running sessions are not affected.

## Status Notifications

Switchboard monitors all your sessions in the background and shows status indicators in the sidebar so you can tell at a glance which sessions need attention — even when you're working in a different one.

![Status Notifications](build/screenshot-notifications.png)

- **Waiting for input** — A session that needs your response is highlighted so you don't miss it.
- **Permission approval** — When Claude is blocked waiting for a permission grant, the session badge lets you know immediately.
- **Activity indicators** — See which sessions are actively running, idle, or finished.

Those signals come from the CLI itself. Switchboard installs a hook in
`~/.claude/settings.json` that reports when a turn starts, needs you, or
finishes, so a badge changes on the event rather than on a guess. Reading the
terminal title remains as a fallback for sessions that are not hooked.

Hooks you configured yourself are never modified, and **Settings → Agent
Status** shows whether the hook is live, with a Test button that exercises the
whole delivery path. See [docs/agent-status-hooks.md](docs/agent-status-hooks.md)
for the arbitration rules, the wire protocol, and troubleshooting.

## Editor

| Shortcut | Action |
|----------|--------|
| `Cmd+F` / `Ctrl+F` | Find in file (also works in terminal) |
| `Cmd+G` / `Ctrl+G` | Go to line |

## Download

_Sur ce fork, voir « Installation » plus haut. Les liens ci-dessous sont ceux de
l'amont et ne contiennent aucun des ajouts listés au début._

Grab the latest release for your platform:

**[Download Switchboard](https://github.com/doctly/switchboard/releases/latest)**

- **macOS**: `.dmg` (Apple Silicon & Intel)
- **Windows**: `.exe` installer
- **Linux**: `.AppImage` or `.deb`

## Prerequisites

- **Node.js** 20+
- **npm** 10+
- Platform build tools for native modules:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `build-essential`, `python3` (`sudo apt install build-essential python3`)
  - **Windows**: Visual Studio Build Tools or `npm install -g windows-build-tools`

## Development Setup

```bash
# Install dependencies (runs postinstall automatically)
npm install

# Start the app
npm start
```

`npm start` bundles CodeMirror and launches Electron. For faster iteration after the first run:

```bash
npm run electron
```

## Building

All build commands bundle CodeMirror first, then invoke electron-builder.

```bash
# Current platform
npm run build

# Platform-specific
npm run build:mac     # DMG + zip (arm64 + x64)
npm run build:win     # NSIS installer (x64 + arm64)
npm run build:linux   # AppImage + deb (x64 + arm64)
```

Output goes to `dist/`.

## Releasing

_Sur ce fork, Actions étant désactivé, ce flux ne s'applique pas : on construit
en local puis on téléverse avec `gh release create`._

Releases are driven by git tags:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The GitHub Actions workflow builds for all platforms and publishes to GitHub Releases. You can also release locally:

```bash
npm run release   # builds + publishes to GitHub Releases
```

Set `GH_TOKEN` in your environment (a GitHub personal access token with `repo` scope).

## Auto-Updates

_Sur ce fork, le canal est ce dépôt et non celui de l'amont — voir « Mises à
jour et CI » plus haut._

The app uses `electron-updater` to check for updates from GitHub Releases on launch and every 4 hours. Updates are only checked in packaged builds (not during development). The flow:

1. App auto-downloads updates in the background
2. A toast notification appears when the update is ready
3. User can restart immediately or dismiss (installs on next quit)

## Code Signing

_Sur ce fork, aucun certificat Apple n'est disponible : les builds sont signés
en ad-hoc et non notarisés._

For distribution, set these environment variables:

- **macOS**: `CSC_LINK` (p12 certificate) and `CSC_KEY_PASSWORD`, or sign via Keychain
- **Windows**: `CSC_LINK` and `CSC_KEY_PASSWORD` for EV/OV code signing
- Set `CSC_IDENTITY_AUTO_DISCOVERY=false` to skip signing (CI artifact builds)

The macOS build uses custom entitlements (`build/entitlements.mac.plist`) to allow JIT and unsigned memory execution, required by native modules (node-pty, better-sqlite3).

## Project Structure

```
main.js            Electron main process
preload.js         Context bridge (IPC bindings)
db.js              SQLite session cache & metadata
public/            Renderer (HTML/CSS/JS)
agent-hooks/       Agent status: protocol, state machine, socket, installer
bin/               The hook client Claude Code runs
scripts/           Build & postinstall scripts
build/             Icons, entitlements, builder resources
docs/              Feature documentation
.github/workflows/ CI/CD
```
