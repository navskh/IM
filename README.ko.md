# IM (Idea Manager)

[English](README.md) | **한국어** | [日本語](README.ja.md) | [中文](README.zh.md)

> 자유로운 브레인스토밍을 구조화된 태스크 트리와 AI 프롬프트로 변환

개발자를 위한 로컬 기반 태스크 관리 도구. 아이디어를 워크스페이스와 프로젝트로 정리하고, 각 태스크에 프롬프트를 작성한 뒤 AI 에이전트에게 넘길 수 있습니다. 내장 MCP 서버로 AI 에이전트의 자율 실행을 지원합니다. Git을 통한 PC 간 동기화.

![IM Workspace](docs/im-workspace-mockup.png)

## 빠른 시작

```bash
npm install -g idea-manager
im start
```

네이티브 앱처럼 독립 윈도우로 열립니다 (Chrome/Edge `--app` 모드). 첫 실행 시 자동 빌드됩니다.

## 핵심 워크플로우

```
브레인스토밍 → 프로젝트 / 태스크 → 프롬프트 → AI 에이전트 실행
```

### 계층 구조

```
워크스페이스
├── 프로젝트 A
│   ├── 태스크 1  →  프롬프트
│   ├── 태스크 2  →  프롬프트
│   └── 태스크 3  →  프롬프트
└── 프로젝트 B
    ├── 태스크 4  →  프롬프트
    └── 태스크 5  →  프롬프트
```

### 태스크 상태 흐름

```
💡 아이디어 → ✏️ 작성중 → 🚀 제출 → 🧪 테스트 → ✅ 완료
                                                    🔴 문제
```

## CLI 명령어

| 명령어 | 설명 |
|--------|------|
| `im start` | 웹 UI 시작 (포트 3456) |
| `im start -p 4000` | 커스텀 포트 |
| `im mcp` | MCP 서버 시작 (stdio) |
| `im watch` | 제출된 태스크 AI 자동 실행 |
| `im sync init` | PC 간 동기화 초기화 |
| `im sync push` | 데이터 내보내기 + push |
| `im sync pull` | 데이터 가져오기 |
| `im sync` | 동기화 상태 확인 |

## 주요 기능

### 멀티 에이전트 지원

프로젝트별로 AI CLI를 선택할 수 있습니다:

| 에이전트 | CLI | 설명 |
|----------|-----|------|
| **Claude** | `claude` | Anthropic Claude Code CLI |
| **Gemini** | `gemini` | Google Gemini CLI |
| **Codex** | `codex` | OpenAI Codex CLI |

프로젝트 헤더의 드롭다운에서 선택. Watch 모드와 AI Chat에 적용됩니다.

### PC 간 동기화

Git 리포지토리를 통해 여러 PC에서 데이터를 동기화합니다.

```bash
# 첫 번째 PC
im sync init          # Git 리포 생성/연결
im sync push          # 내보내기 + push

# 다른 PC
im sync init          # 같은 리포 URL 입력
im sync pull          # 가져오기
```

[GitHub CLI](https://cli.github.com) (`gh`)가 있으면 리포 자동 생성을 지원합니다.

### MCP 서버

Model Context Protocol로 외부 AI 에이전트에 태스크를 노출합니다.

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

### Watch 모드

제출된 태스크를 AI로 자동 실행 (실시간 스트리밍 출력):

```bash
im watch                          # Watch 활성화된 모든 프로젝트
im watch --project <id>           # 특정 프로젝트
im watch --interval 30 --dry-run  # 미리보기 모드
```

### 워크스페이스

- **3-패널 레이아웃** — 브레인스토밍 | 프로젝트 트리 | 태스크 상세 (드래그로 크기 조절)
- **탭 기반 네비게이션** — 여러 프로젝트 동시 열기
- **파일 트리 드로어** — 연결된 프로젝트 디렉토리 탐색
- **브레인스토밍 패널** — 자유로운 메모 + AI 인라인 메모
- **프롬프트 에디터** — 태스크별 프롬프트 작성/편집/복사
- **AI 채팅** — 태스크별 대화로 작업 개선
- **대시보드** — Active / All / Today 뷰
- **키보드 단축키** — `B` 브레인스토밍, `N` 서브 프로젝트, `T` 태스크, `Cmd+1~6` 상태 변경

### 데이터

- **로컬 우선** — 모든 데이터는 `~/.idea-manager/data/`에 저장 (SQLite via sql.js)
- **네이티브 의존성 없음** — 순수 JavaScript, C++ 빌드 도구 불필요
- **자동 백업** — sync pull 시 기존 DB 자동 백업
- **앱 모드** — 주소창 없는 독립 윈도우로 실행

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| 백엔드 | Next.js API Routes |
| 데이터베이스 | SQLite (sql.js, 순수 JS) |
| AI | Claude / Gemini / Codex CLI |
| MCP | Model Context Protocol (stdio) |
| CLI | Commander.js |

## 요구사항

- **Node.js** 18+
- **AI CLI** (선택) — [Claude CLI](https://docs.anthropic.com/en/docs/claude-code), [Gemini CLI](https://github.com/google-gemini/gemini-cli), 또는 [Codex CLI](https://github.com/openai/codex). AI 기능에 필요하며, 태스크 관리는 CLI 없이도 사용 가능.

## 문제 해결

**설치 후 `im` 명령어를 찾을 수 없음**

```bash
# npm 글로벌 경로를 PATH에 추가
export PATH="$(npm prefix -g)/bin:$PATH"
# ~/.zshrc 또는 ~/.bashrc에 위 줄 추가 후
source ~/.zshrc
```

**포트가 이미 사용 중**

```bash
lsof -t -i :3456 | xargs kill -9    # macOS/Linux
```

## 라이선스

MIT
