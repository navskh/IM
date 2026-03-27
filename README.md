# IM (Idea Manager)

**English** | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh.md)

> Turn free-form brainstorming into structured task trees with AI-generated prompts.

A local-first task management tool for developers. Organize ideas into sub-projects and tasks, refine prompts for each task, and hand them off to AI agents. Built-in MCP Server enables autonomous AI agent execution. Cross-PC sync via Git.

## Quick Start

```bash
npm install -g idea-manager
im start
```

Opens a native-like app window (Chrome/Edge `--app` mode). First run builds automatically.

## Core Workflow

```
Brainstorming → Sub-projects / Tasks → Prompts → AI Agent Execution
```

### Hierarchy

```
Project
├── Sub-project A
│   ├── Task 1  →  Prompt
│   ├── Task 2  →  Prompt
│   └── Task 3  →  Prompt
└── Sub-project B
    ├── Task 4  →  Prompt
    └── Task 5  →  Prompt
```

### Task Status Flow

```
💡 Idea → ✏️ Writing → 🚀 Submitted → 🧪 Testing → ✅ Done
                                                      🔴 Problem
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `im start` | Start web UI (port 3456) |
| `im start -p 4000` | Custom port |
| `im mcp` | Start MCP server (stdio) |
| `im watch` | Auto-execute submitted tasks via AI CLI |
| `im sync init` | Initialize cross-PC sync |
| `im sync push` | Export data + push to Git |
| `im sync pull` | Pull + import data |
| `im sync` | Show sync status |

## Features

### Multi-Agent Support

Choose your AI CLI per project:

| Agent | CLI | Description |
|-------|-----|-------------|
| **Claude** | `claude` | Anthropic Claude Code CLI |
| **Gemini** | `gemini` | Google Gemini CLI |
| **Codex** | `codex` | OpenAI Codex CLI |

Select from the project header dropdown. Used for Watch mode and AI Chat.

### Cross-PC Sync

Sync your data across machines via a private Git repository.

```bash
# First machine
im sync init          # Create/connect a Git repo
im sync push          # Export + push

# Other machines
im sync init          # Same repo URL
im sync pull          # Pull + import
```

Supports auto repo creation with [GitHub CLI](https://cli.github.com) (`gh`).

### MCP Server

Expose tasks to external AI agents via Model Context Protocol.

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "idea-manager": {
      "command": "npx",
      "args": ["-y", "idea-manager", "mcp"]
    }
  }
}
```

**Claude Code**:

```bash
claude mcp add idea-manager -- npx -y idea-manager mcp
```

#### MCP Tools

| Tool | Description |
|------|-------------|
| `list-projects` | List all projects |
| `get-project-context` | Full sub-project + task tree |
| `get-next-task` | Next submitted task to execute |
| `get-task-prompt` | Get prompt for a task |
| `update-status` | Change task status |
| `report-completion` | Report task done |

### Watch Mode

Auto-execute submitted tasks with real-time streaming output:

```bash
im watch                          # All watch-enabled projects
im watch --project <id>           # Specific project
im watch --interval 30 --dry-run  # Preview mode
```

### Workspace

- **3-Panel Layout** — Brainstorming | Project Tree | Task Detail (drag to resize)
- **Tab-based Navigation** — Multiple projects open simultaneously
- **File Tree Drawer** — Browse linked project directories
- **Brainstorming Panel** — Free-form notes with inline AI memos
- **Auto Distribute** — AI analyzes brainstorming and distributes tasks to sub-projects with preview/edit modal
- **Prompt Editor** — Write/edit/copy prompts per task
- **AI Chat** — Per-task conversations to refine work, with loading/done indicators in project tree
- **Quick Memo** — Global scratchpad on dashboard for free-form notes (auto-saved)
- **Morning Notifications** — Daily macOS notification at 9 AM with today's tasks summary
- **Dashboard** — Active / All / Today views
- **Keyboard Shortcuts** — `B` brainstorm, `N` sub-project, `T` task, `Cmd+1~6` status

### Data

- **Local-first** — All data in `~/.idea-manager/data/` (SQLite via sql.js)
- **Zero native deps** — Pure JavaScript, no C++ build tools needed
- **Auto backup** — Database backed up before each sync pull
- **App mode** — Opens in Chrome/Edge without address bar

## Tech Stack

| Area | Technology |
|------|------------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Backend | Next.js API Routes |
| Database | SQLite (sql.js, pure JS) |
| AI | Claude / Gemini / Codex CLI |
| MCP | Model Context Protocol (stdio) |
| CLI | Commander.js |

## Requirements

- **Node.js** 18+
- **AI CLI** (optional) — [Claude CLI](https://docs.anthropic.com/en/docs/claude-code), [Gemini CLI](https://github.com/google-gemini/gemini-cli), or [Codex CLI](https://github.com/openai/codex) for AI features. Core task management works without it.

## Troubleshooting

**`im` command not found after install**

Add npm's global bin directory to your PATH:

```bash
# Check the path
npm prefix -g
# Add to shell profile (~/.zshrc or ~/.bashrc)
export PATH="$(npm prefix -g)/bin:$PATH"
```

**Port already in use**

```bash
# Kill the process using the port
lsof -t -i :3456 | xargs kill -9    # macOS/Linux
netstat -ano | findstr :3456          # Windows (then taskkill /PID <pid> /F)
```

## Changelog

### v1.2.0

- **Auto Distribute** — AI-powered brainstorming to task distribution with preview/edit modal
- **Quick Memo** — Global scratchpad on dashboard (auto-saved to DB)
- **Chat state indicators** — Loading/done badges on tasks in project tree (persists until task opened)
- **Chat isolation fix** — Switching tasks no longer mixes AI responses between tasks
- **Morning scheduler** — Daily 9 AM macOS notification with today's tasks summary
- **Gemini JSON parsing** — Fix raw JSON display in Gemini chat responses
- **Resizable description** — Task description textarea is now vertically resizable

### v1.1.7

- Fix: write DB to disk immediately instead of delayed save

## License

MIT
