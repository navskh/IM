# IM (Idea Manager)

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | **中文**

> 从创意到可执行提示词 — 多项目工作流管理器

专为同时管理多个项目的开发者设计的任务管理工具。将创意组织成子项目和任务，为每个任务精炼提示词，并交给 Claude Code 等 AI 代理执行。内置 MCP Server，AI 代理可以自主获取并执行任务。

![IM Workspace](docs/screenshot.png)

## 核心工作流

```
头脑风暴 → 组织成子项目/任务 → 精炼提示词 → 通过 MCP 执行 AI
```

### 层级结构

```
项目
├── 子项目 A
│   ├── 任务 1  →  提示词
│   ├── 任务 2  →  提示词
│   └── 任务 3  →  提示词
└── 子项目 B
    ├── 任务 4  →  提示词
    └── 任务 5  →  提示词
```

### 任务状态流

```
💡 Idea → ✏️ Writing → 🚀 Submitted → 🧪 Testing → ✅ Done
                                                      🔴 Problem
```

## 安装

```bash
npm install -g idea-manager
```

## 使用方法

### 启动 Web UI

```bash
im start
```

在 `http://localhost:3456` 打开 Web UI。

```bash
# 自定义端口
im start -p 4000
```

### 启动 MCP Server

```bash
im mcp
```

#### Claude Desktop 配置 (claude_desktop_config.json)

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

#### Claude Code 配置

```bash
claude mcp add idea-manager -- npx -y idea-manager mcp
```

### MCP 工具

| 工具 | 描述 |
|------|------|
| `list-projects` | 获取项目列表 |
| `get-project-context` | 获取完整的子项目+任务树 |
| `get-next-task` | 获取下一个待执行的任务和提示词（status=submitted） |
| `get-task-prompt` | 获取指定任务的提示词 |
| `update-status` | 更改任务状态（idea/writing/submitted/testing/done/problem） |
| `report-completion` | 报告任务完成 |

## 主要功能

- **标签式多项目** — 像浏览器/IDE一样用标签页同时打开多个项目，切换标签时保持状态
- **三栏工作区** — 头脑风暴 | 项目树 | 任务详情，拖拽调整面板大小
- **树形项目结构** — 任务在子项目下层级展示
- **头脑风暴面板** — 自由格式笔记，可折叠/展开
- **提示词编辑器** — 按任务编写/编辑/复制提示词，AI 润色
- **AI 聊天** — 按任务进行 AI 对话以细化提示词
- **三标签仪表盘** — 进行中 / 全部 / 今日待办
- **键盘快捷键** — Ctrl+Tab/Ctrl+Shift+Tab 切换标签，B：切换头脑风暴，N：添加子项目，T：添加任务，Cmd+1~6：更改状态
- **PWA 支持** — 可安装为应用，在独立窗口中使用
- **Watch 模式** — 通过 Claude CLI 自动执行已提交的任务，实时显示进度
- **内置 MCP Server** — 支持 AI 代理自主执行
- **本地优先** — 基于 SQLite，数据存储在 `~/.idea-manager/`

## 技术栈

| 领域 | 技术 |
|------|------|
| 前端 | Next.js 15, React 19, TypeScript, Tailwind CSS 4 |
| 后端 | Next.js API Routes |
| 数据库 | SQLite (better-sqlite3) |
| AI | Claude CLI（基于订阅，无需 API 密钥） |
| MCP | Model Context Protocol (stdio) |
| CLI | Commander.js |

## 系统要求

- **Node.js** 18+
- **Claude CLI** — AI 聊天/润色功能需要（需要 Claude 订阅）。即使没有，任务管理和提示词编写等基本功能也可正常使用。

## 许可证

MIT
