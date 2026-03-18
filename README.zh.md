# IM (Idea Manager)

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | **中文**

> 将自由头脑风暴转化为结构化任务树和AI提示词

面向开发者的本地优先任务管理工具。将想法组织成子项目和任务，为每个任务编写提示词，然后交给AI代理执行。内置MCP服务器支持AI代理自主执行。通过Git实现跨PC同步。

## 快速开始

```bash
npm install -g idea-manager
im start
```

以原生应用般的独立窗口打开（Chrome/Edge `--app` 模式）。首次运行时自动构建。

## CLI命令

| 命令 | 说明 |
|------|------|
| `im start` | 启动Web UI（端口3456） |
| `im mcp` | 启动MCP服务器（stdio） |
| `im watch` | AI自动执行已提交的任务 |
| `im sync init` | 初始化跨PC同步 |
| `im sync push` | 导出数据 + push |
| `im sync pull` | 导入数据 |

## 主要功能

- **多代理支持** — 按项目选择 Claude / Gemini / Codex
- **跨PC同步** — 通过Git仓库同步数据
- **MCP服务器** — 向外部AI代理公开任务
- **三面板布局** — 头脑风暴 | 项目树 | 任务详情
- **标签导航** — 同时打开多个项目
- **文件树** — 浏览关联的项目目录
- **AI聊天** — 按任务对话改进工作
- **本地优先** — SQLite (sql.js)，无原生依赖

## 要求

- **Node.js** 18+
- **AI CLI**（可选）— Claude / Gemini / Codex CLI

## 许可证

MIT
