# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IM (Idea Manager) is an npm package that converts free-form brainstorming into structured task trees with AI-generated prompts, exposable via MCP Server for autonomous AI agent execution. Everything runs locally — Next.js web UI, SQLite database (`~/.idea-manager/data/im.db`), and MCP over stdio.

## Commands

```bash
# Development
npm run dev          # Next.js dev server on port 3456

# Build
npm run build        # Next.js standalone build

# Lint
npm run lint         # ESLint

# MCP Server (stdio mode)
npm run mcp          # runs tsx src/cli.ts mcp

# CLI (when installed globally)
im start             # Start web UI + open browser
im start -p 4000     # Custom port
im mcp               # Start MCP server
```

## Architecture

### Core Flow

```
Brainstorming text → AI structuring (Claude Agent SDK) → Item tree in SQLite
                   → AI questions as memos (inline pins) + chat messages
                   → AI prompt generation per item
                   → MCP Server exposes tasks to external AI agents
```

### Three AI Pipelines (all in `src/lib/ai/`)

1. **client.ts** — Raw Claude Agent SDK calls via `query()` from `@anthropic-ai/claude-agent-sdk`. Two functions: `runStructure` (JSON array output) and `runStructureWithQuestions` (JSON object with items + questions). Both use `allowedTools: []` and `maxTurns: 1`.

2. **structurer.ts** — Orchestrates brainstorming → item tree conversion. `structureWithChat()` loads conversation history, calls AI, replaces items in DB, resolves old memos, creates new memos from AI questions.

3. **chat-responder.ts** — Handles user chat messages. Saves user message, reloads brainstorm + full history, re-runs `runStructureWithQuestions`, updates tree + memos. The key insight: every chat interaction re-structures the entire brainstorm with updated context.

4. **prompter.ts** — Generates execution prompts per item. Respects manual prompts (won't overwrite). Includes brainstorm content + conversation history as context.

### Database Layer (`src/lib/db/`)

- **Singleton pattern** in `index.ts` — `getDb()` lazily creates SQLite connection with WAL mode and foreign keys enabled
- **Schema** (`schema.ts`) — 6 tables: `projects`, `brainstorms`, `items`, `conversations`, `memos`, `prompts`
- **Items** use a self-referential `parent_id` for tree structure; `is_locked` (integer 0/1) controls MCP visibility; `replaceItems()` does full delete+reinsert on each structuring pass
- **Queries** are split by entity in `queries/` — all use synchronous better-sqlite3 prepared statements

### MCP Server (`src/lib/mcp/`)

- **server.ts** — Registers 6 tools on `McpServer` with zod schemas, uses `StdioServerTransport`
- **tools.ts** — `McpToolContext` interface decouples MCP from direct DB access; `getNextTask()` finds first unlocked+pending item by sort_order
- CLI entry (`src/cli.ts`) wires DB query functions into `McpToolContext` and starts the server

### Web UI

- **Dashboard** (`src/app/page.tsx`) — Project list with create/delete
- **Project Workspace** (`src/app/projects/[id]/page.tsx`) — 2-panel layout: left panel has Editor (top, resizable) + ChatPanel (bottom); right panel has TreeView
- **Lock/unlock cascade** — Locking a parent locks all children; unlocking makes items available to MCP's `get-next-task`
- **API Routes** (`src/app/api/`) — RESTful endpoints for projects, brainstorms, items, conversations, memos, structure, and prompts

### Key Design Decisions

- **`@anthropic-ai/claude-agent-sdk`** (not direct Anthropic API) — Uses the user's Claude subscription, no separate API key needed. Requires `ANTHROPIC_API_KEY` env var.
- **Full replace on structure** — Each AI structuring pass replaces all items for the project (not incremental merge). User-edited prompts (type `manual`) are preserved.
- **Path alias** `@/*` maps to `./src/*` (tsconfig paths)
- **SQLite via sql.js (wasm)** — `next.config.mjs` has `serverExternalPackages: ['sql.js']` so the package isn't bundled; sql.js resolves its `.wasm` asset relative to its own `__dirname`. `src/lib/db/index.ts` wraps sql.js's async API in a synchronous better-sqlite3-compatible shim (`prepare().all/get/run`, `transaction`, `pragma`, `exec`). Writes mark `dirty` and `fs.writeFileSync` exports the whole DB to `~/.idea-manager/data/im.db`.
- **Data directory** — All data stored in `~/.idea-manager/data/`

## Type Conventions

- Interfaces use `I` prefix: `IProject`, `IItem`, `IItemTree`, `IBrainstorm`, `IConversation`, `IMemo`, `IPrompt`
- Union types for enums: `ItemType`, `ItemStatus`, `ItemPriority`
