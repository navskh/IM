# IM (Idea Manager)

[English](README.md) | [한국어](README.ko.md) | **日本語** | [中文](README.zh.md)

> アイデアから実行可能なプロンプトまで — マルチプロジェクトワークフローマネージャー

複数のプロジェクトを同時に進めるデベロッパー向けのタスク管理ツールです。アイデアをサブプロジェクトとタスクに整理し、各タスクごとにプロンプトを磨いてClaude CodeなどのAIエージェントに渡すことができます。MCP Serverを内蔵しており、AIエージェントが自律的にタスクを取得して実行できます。

![IM Workspace](docs/screenshot.png)

## コアワークフロー

```
ブレインストーミング → サブプロジェクト/タスクに整理 → プロンプト精製 → MCPでAI実行
```

### 階層構造

```
プロジェクト
├── サブプロジェクト A
│   ├── タスク 1  →  プロンプト
│   ├── タスク 2  →  プロンプト
│   └── タスク 3  →  プロンプト
└── サブプロジェクト B
    ├── タスク 4  →  プロンプト
    └── タスク 5  →  プロンプト
```

### タスクステータスフロー

```
💡 Idea → ✏️ Writing → 🚀 Submitted → 🧪 Testing → ✅ Done
                                                      🔴 Problem
```

## インストール

```bash
npm install -g idea-manager
```

## 使い方

### Web UIの起動

```bash
im start
```

`http://localhost:3456`でWeb UIが開きます。

```bash
# ポート変更
im start -p 4000
```

### MCP Serverの起動

```bash
im mcp
```

#### Claude Desktop設定 (claude_desktop_config.json)

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

#### Claude Code設定

```bash
claude mcp add idea-manager -- npx -y idea-manager mcp
```

### MCPツール

| ツール | 説明 |
|--------|------|
| `list-projects` | プロジェクト一覧の取得 |
| `get-project-context` | サブプロジェクト＋タスクツリー全体の取得 |
| `get-next-task` | 次に実行するタスクとプロンプトの取得（status=submitted） |
| `get-task-prompt` | 特定タスクのプロンプト取得 |
| `update-status` | タスクステータスの変更（idea/writing/submitted/testing/done/problem） |
| `report-completion` | タスク完了の報告 |

## 主な機能

- **タブベースのマルチプロジェクト** — ブラウザ/IDEのように複数プロジェクトをタブで同時に開き、タブ切替時に状態を保持
- **3パネルワークスペース** — ブレインストーミング | プロジェクトツリー | タスク詳細、パネル間ドラッグでサイズ調整
- **ツリー型プロジェクト構造** — サブプロジェクト配下にタスクを階層的に表示
- **ブレインストーミングパネル** — 自由形式メモ、折りたたみ/展開可能
- **プロンプトエディタ** — タスクごとにプロンプトを作成/編集/コピー、AIによる磨き上げ
- **AIチャット** — タスクごとのAI対話でプロンプトを具体化
- **3タブダッシュボード** — 進行中 / 全体 / 今日のタスク
- **キーボードショートカット** — Ctrl+Tab/Ctrl+Shift+Tabでタブ移動、B: ブレインストーミング切替、N: サブプロジェクト追加、T: タスク追加、Cmd+1~6: ステータス変更
- **PWA対応** — アプリとしてインストールして独立ウィンドウで使用可能
- **Watchモード** — submittedタスクをClaude CLIで自動実行、リアルタイム進捗表示
- **MCP Server内蔵** — AIエージェントの自律実行をサポート
- **ローカルファースト** — SQLiteベース、データは`~/.idea-manager/`に保存

## 技術スタック

| 領域 | 技術 |
|------|------|
| フロントエンド | Next.js 15, React 19, TypeScript, Tailwind CSS 4 |
| バックエンド | Next.js API Routes |
| データベース | SQLite (better-sqlite3) |
| AI | Claude CLI（サブスクリプションベース、APIキー不要） |
| MCP | Model Context Protocol (stdio) |
| CLI | Commander.js |

## 必要条件

- **Node.js** 18+
- **Claude CLI** — AIチャット/磨き上げ機能に必要（Claudeサブスクリプション必要）。なくてもタスク管理やプロンプト作成などの基本機能は正常に動作します。

## ライセンス

MIT
