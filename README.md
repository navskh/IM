# IM (Idea Manager)

**English** | [한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh.md)

> From ideas to executable prompts — a multi-project workflow manager

A task management tool for developers juggling multiple projects simultaneously. Organize ideas into sub-projects and tasks, refine prompts for each task, and hand them off to AI agents like Claude Code. With a built-in MCP Server, AI agents can autonomously pick up and execute tasks.

![IM Workspace](docs/screenshot.png)

## Core Workflow

```
Brainstorming → Organize into Sub-projects/Tasks → Refine Prompts → Execute via MCP
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

## Installation

```bash
npm install -g idea-manager
```

## Usage

### Start Web UI

```bash
im start
```

Opens the web UI at `http://localhost:3456`.

```bash
# Custom port
im start -p 4000
```

### Start MCP Server

```bash
im mcp
```

#### Claude Desktop Configuration (claude_desktop_config.json)

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

#### Claude Code Configuration

```bash
claude mcp add idea-manager -- npx -y idea-manager mcp
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `list-projects` | List all projects |
| `get-project-context` | Get full sub-project + task tree |
| `get-next-task` | Get next task to execute (status=submitted) |
| `get-task-prompt` | Get prompt for a specific task |
| `update-status` | Change task status (idea/writing/submitted/testing/done/problem) |
| `report-completion` | Report task completion |

## Key Features

- **Tab-based Multi-project** — Open multiple projects in tabs like a browser/IDE, state preserved on tab switch
- **3-Panel Workspace** — Brainstorming | Project Tree | Task Detail, drag to resize panels
- **Tree-structured Projects** — Tasks displayed hierarchically under sub-projects
- **Brainstorming Panel** — Free-form notes, collapsible
- **Prompt Editor** — Write/edit/copy prompts per task, AI refinement
- **AI Chat** — Per-task AI conversations to refine prompts
- **3-Tab Dashboard** — Active / All / Today
- **Keyboard Shortcuts** — Ctrl+Tab/Ctrl+Shift+Tab for tab navigation, B: toggle brainstorm, N: add sub-project, T: add task, Cmd+1~6: change status
- **PWA Support** — Install as an app for a standalone window experience
- **Watch Mode** — Auto-execute submitted tasks via Claude CLI with real-time progress
- **Built-in MCP Server** — Supports autonomous AI agent execution
- **Local-first** — SQLite-based, data stored in `~/.idea-manager/`

## Tech Stack

| Area | Technology |
|------|------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS 4 |
| Backend | Next.js API Routes |
| Database | SQLite (better-sqlite3) |
| AI | Claude CLI (subscription-based, no API key needed) |
| MCP | Model Context Protocol (stdio) |
| CLI | Commander.js |

## Requirements

- **Node.js** 18+
- **Claude CLI** — Required for AI chat/refinement features (Claude subscription needed). Core features like task management and prompt editing work without it.

## License

MIT
