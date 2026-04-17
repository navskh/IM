# Security Policy

IM (Idea Manager) is a **local-first CLI task manager** that intentionally uses the following capabilities. This document explains each and why they are safe.

## Reporting a Vulnerability

Open an issue at <https://github.com/navskh/IM/issues> or email the maintainer.
We take security seriously; please report privately if the issue could be exploited.

---

## Intentional Capabilities (not vulnerabilities)

### 1. Network calls

| Where | Purpose |
|---|---|
| `registry.npmjs.org` | Check if a newer version is published (version badge + auto-update) |
| `http://localhost:<port>` | Readiness probe during `im start` |

No external hostnames except `registry.npmjs.org`. No telemetry. No analytics.

### 2. Child process spawn

| Binary | Purpose |
|---|---|
| `claude` / `gemini` / `codex` | User-chosen AI CLI for the Advisor, Refine, and Watch features |
| `npm` | Only invoked by the auto-update flow to run `npm install -g idea-manager@latest` |
| `git` / `gh` | Only invoked by the optional Git sync feature |
| User's default browser | `im start` opens the web UI via `--app=` mode |

All binary names are fixed. No user input is ever concatenated into a shell command; arguments are passed as arrays to `child_process.spawn`/`execFile`. `shell: true` is only set on Windows (required for `.cmd` wrapper resolution) and arguments are escaped by Node's native handling.

### 3. Filesystem access

| Path | Purpose |
|---|---|
| `~/.idea-manager/data/im.db` | SQLite database (user's tasks, notes, conversations) |
| `~/.idea-manager/sync/` | Optional Git sync working directory |
| `~/.idea-manager/media/` | Reserved for future image attachments |
| Package install directory | Read-only — Next.js build output, node_modules |
| User-selected project paths | Listed/scanned for file tree UI; read only |

No writes outside `~/.idea-manager/` and the package's own install directory.

### 4. Auto-update (v1.8.0+)

`im start` checks npm registry on boot and, if a newer version is available,
spawns `npm install -g idea-manager@latest` and re-execs itself. This is an
intentional "download-and-execute" pattern. It can be disabled with:

```bash
IM_NO_AUTO_UPDATE=1 im start
```

We require the `im` binary to already be installed globally by the user.
The install command is invoked with fixed arguments, not derived from user input.

### 5. CSRF protection

All `/api/*` mutation endpoints (POST/PUT/DELETE/PATCH) reject cross-origin
browser requests. Only same-origin (`localhost`/`127.0.0.1`) or non-browser
clients (no `Origin` header, e.g. CLI/MCP) are allowed. See `src/middleware.ts`.

### 6. What IM does NOT do

- No remote code execution (beyond known AI CLIs or `npm install`)
- No credential handling (relies on user's pre-configured AI CLI auth)
- No telemetry or analytics
- No outbound network except npm registry version check
- No access to browser data, OAuth tokens, or passwords
- No uploads to any third-party service

---

## Known Static-Analyzer False Positives

Some static-analysis tools (e.g., SafeSkill) flag the following as risky:

- `http.get()` + filesystem access → **readiness probe only**, target is `localhost`
- `fetch(npmjs.org)` + `spawn('npm install -g')` → **intentional auto-update**, opt-out available
- `spawn(agent-binary)` with project `cwd` → **user-configured AI CLI**, not arbitrary code

These are features, not vulnerabilities. They are documented here for auditors.

---

## Runtime Hardening

- Next.js middleware blocks cross-origin mutation attempts.
- AI CLI spawn uses fixed binary names; user input is never shell-interpolated.
- SQLite prepared statements; no string concatenation into SQL.
- sql.js WASM pinned to the bundled `sql.js/dist/sql-wasm.wasm` (see `next.config.mjs`).
- Standalone Next.js build removes absolute paths from published artifacts.

---

Last updated: 2026-04-17
