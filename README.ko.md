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
💡 아이디어 → 🔥 진행중 → ✅ 완료
                           🔴 문제
```

기존 상태(`작성중`, `제출`, `테스트`)는 그대로 유지되며, v1.6 이전 태스크에 한해 점선 뱃지로 표시됩니다.

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

### 노트 중심 에디터 (v1.6)

기존의 "설명 + 프롬프트" 분리 구조를 하나의 마크다운 노트로 통합했습니다.

- **CodeMirror 에디터** — 마크다운 문법 하이라이트: 헤딩·리스트 마커(`-`, `1.`)·코드·링크·인용 시각 분리. GFM 활성화 (체크박스·취소선·테이블).
- **⌘K AI 명령 팔레트** — 노트를 떠나지 않고 선택 영역을 다듬거나 커서에서 이어 쓰기:
  - 이어서 써줘 · 이 부분 정리해줘 · 할 일로 쪼개줘 · 질문으로 바꿔줘 · 요약해줘 · 직접 입력
  - 결과가 해당 위치에 바로 삽입됩니다. 실행 중 **취소**, 적용 후 30초 내 **되돌리기** 가능.
  - Sonnet 모델 + 경량 컨텍스트로 평균 ~7초 응답.
- **맥락 인식 자동완성** — 고스트 텍스트가 다단어 구절(최대 3개)을 제안. 코퍼스에 현재 노트 + 같은 프로젝트 형제 태스크 + 브레인스토밍을 포함. 현재 노트와 어휘가 겹치는 구절이 우선 노출되어 주제 연관 단어가 상위로. `Tab` 수락, `Esc` 해제.
- **리스트 자동 이어쓰기** — Enter로 불릿/번호/체크박스 이어 씀, 빈 항목에서 Enter로 리스트 탈출.
- **Copy as Prompt** — 노트 전체를 Claude Code 등에 붙여넣기 좋은 포맷으로 한 번에 복사.

### 워크스페이스

- **3-패널 레이아웃** — 브레인스토밍 | 프로젝트 트리 | 태스크 상세 (드래그로 크기 조절)
- **탭 기반 네비게이션** — 여러 프로젝트 동시 열기
- **파일 트리 드로어** — 연결된 프로젝트 디렉토리 탐색
- **브레인스토밍 패널** — 자유로운 메모 + AI 인라인 메모
- **자동 분배** — AI가 브레인스토밍을 분석하여 프로젝트들로 태스크 자동 분배 (미리보기/편집 모달)
- **Note Assistant** — 태스크별 AI 대화 (구 "AI 채팅")로 노트를 다듬고, 한 번의 클릭으로 노트에 삽입
- **Quick Memo** — 대시보드 상단의 전역 스크래치패드 (자동 저장)
- **아침 알림** — 매일 오전 9시 오늘의 태스크 요약을 macOS 알림으로
- **대시보드** — Active / All / Today / Archive 뷰
- **키보드 단축키** — `B` 브레인스토밍, `N` 프로젝트, `T` 태스크, `⌘K` AI 명령 팔레트, `⌘1/2/3/4` 상태 (아이디어/진행중/완료/문제)

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

## 변경 이력

### v1.6.0

- **⌘K AI 명령 팔레트** — 노트 안에서 다듬기/이어 쓰기/요약/할 일 분해 명령, 결과가 커서에 바로 삽입. 취소 + 30초 되돌리기. Sonnet + 경량 컨텍스트로 90s 타임아웃 → ~7s.
- **CodeMirror 노트 에디터** — textarea를 풀 마크다운 에디터로 교체: 문법 하이라이트, GFM 체크박스/취소선/테이블, 리스트 자동 이어쓰기, 고스트 자동완성.
- **맥락 인식 자동완성** — 현재 노트 + 형제 태스크 + 브레인스토밍에서 다단어 구절 제안. 공유 어휘 가중치로 주제 연관 완성이 우선.
- **`doing` 상태 추가** — 기본 플로우를 아이디어 → 진행중 → 완료로 단순화. 기존 상태는 뱃지로 호환.
- **태스크 아카이브 / 태그** — `is_archived`, `tags` 컬럼, 대시보드 Archive 탭.
- **프롬프트 → 노트 병합** — 기존 `task_prompts`가 노트 설명에 일회 병합 (멱등).
- **Note Assistant** — 태스크 AI 채팅을 노트 작성 보조 역할로 재배치, 한 번의 클릭으로 노트 삽입.
- 런타임: `RunAgentOptions.model` 오버라이드, CodeMirror 내부 입력을 글로벌 단축키에서 제외.

## 라이선스

MIT
