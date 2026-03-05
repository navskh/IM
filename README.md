# IM (Idea Manager)

> 자유롭게 아이디어를 쏟아내면, AI가 구조화해드립니다.

브레인스토밍 텍스트를 AI가 분석하여 실행 가능한 작업 트리로 변환하고, 각 작업에 대한 프롬프트를 생성하여 MCP Server를 통해 AI 에이전트가 자율적으로 실행할 수 있게 하는 도구입니다.

## 핵심 워크플로우

```
브레인스토밍 → AI 구조화 → 프롬프트 생성 → MCP 실행
```

### 1. 브레인스토밍

자유로운 형태로 아이디어를 작성합니다. 구조나 형식에 구애받지 않고 생각나는 대로 써내려갑니다.

### 2. AI 구조화

AI가 브레인스토밍 텍스트를 분석하여 계층형 작업 트리로 변환합니다.
모호한 부분이 있으면 AI가 질문을 던지고, 채팅을 통해 답변하면 구조가 점점 정교해집니다.

```
프로젝트
├── 기능 A (feature)
│   ├── 작업 A-1 (task)
│   └── 작업 A-2 (task)
├── 기능 B (feature)
│   └── 버그 수정 (bug)
└── 아이디어 메모 (idea)
```

### 3. 프롬프트 생성

구조화된 각 항목에 대해 AI가 실행 가능한 프롬프트를 자동 생성합니다.
수동으로 편집하거나 직접 작성할 수도 있습니다.

### 4. MCP 실행

내장된 MCP Server를 통해 Claude 등 AI 에이전트가 작업을 조회하고, 상태를 업데이트하며, 순차적으로 실행할 수 있습니다.

## 설치

```bash
npm install -g idea-manager
```

## 사용법

### 웹 UI 실행

```bash
im start
```

자동으로 `http://localhost:3456`에서 웹 UI가 열립니다.

```bash
# 포트 변경
im start -p 4000
```

### MCP Server 실행

```bash
im mcp
```

Claude Desktop, Claude Code 등에서 MCP Server로 연결하여 AI 에이전트가 작업을 자율 실행할 수 있습니다.

#### Claude Desktop 설정 (claude_desktop_config.json)

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

#### Claude Code 설정

```bash
claude mcp add idea-manager -- npx -y idea-manager mcp
```

### MCP 제공 도구

| 도구 | 설명 |
|------|------|
| `list-projects` | 프로젝트 목록 조회 |
| `get-project-context` | 프로젝트 전체 구조와 진행 상태 조회 |
| `get-next-task` | 다음 실행 가능한 작업과 프롬프트 조회 |
| `get-prompt` | 특정 항목의 프롬프트 조회 |
| `update-status` | 작업 상태 변경 (pending / in_progress / done) |
| `report-completion` | 작업 완료 보고 (자동 잠금) |

## 주요 기능

- **자유 형식 브레인스토밍** - 구조 없이 아이디어를 쏟아내는 에디터
- **AI 대화형 구조화** - AI가 질문하고 유저가 답변하며 구조를 정교화
- **계층형 작업 트리** - feature / task / bug / idea / note 유형 분류
- **잠금/해제 시스템** - 작업 실행 순서를 제어하는 Lock 메커니즘
- **프롬프트 자동 생성** - 각 작업에 대한 실행 프롬프트 생성
- **MCP Server 내장** - AI 에이전트 자율 실행 지원
- **로컬 우선** - SQLite 기반, 데이터는 `~/.idea-manager/`에 저장

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | Next.js, React 19, TypeScript, Tailwind CSS 4 |
| Backend | Next.js API Routes |
| Database | SQLite (better-sqlite3) |
| AI | Anthropic Claude (Agent SDK) |
| MCP | Model Context Protocol (stdio) |
| CLI | Commander.js |

## 환경 변수

```bash
ANTHROPIC_API_KEY=sk-ant-...  # Claude API 키 (AI 기능에 필요)
```

## 라이선스

MIT
