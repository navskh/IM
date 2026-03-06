# IM 아키텍처

## 시스템 구성

```
사용자 PC (localhost)
├── Next.js 웹앱 (localhost:3456)  ← 브라우저 접속
├── Claude Code CLI (spawn)         ← AI 처리
├── MCP Server (stdio)              ← 외부 도구 연동
└── SQLite (~/.idea-manager/data/)  ← 로컬 저장
```

## AI 엔진

Claude Code CLI를 `child_process.spawn()`으로 직접 호출한다.

```
spawn('claude', [
  '--dangerously-skip-permissions',
  '--model', 'sonnet',
  '--output-format', 'stream-json',
  '--max-turns', '1',
  '-p', prompt
])
```

- `@anthropic-ai/claude-agent-sdk`는 사용하지 않음 (broken)
- API 키 불필요 — 사용자의 Claude 구독으로 동작
- stdout에서 stream-json 파싱하여 결과 추출

### AI 파이프라인 (`src/lib/ai/`)

| 파일 | 역할 |
|------|------|
| `client.ts` | Claude CLI spawn 래퍼. `runClaude()`, `runStructure()`, `runStructureWithQuestions()` |
| `structurer.ts` | 브레인스토밍 → 아이템 트리 변환 오케스트레이터. 단일/청크 분석 |
| `chat-responder.ts` | 사용자 채팅 → 전체 재구조화 |
| `prompter.ts` | 아이템별 실행 프롬프트 생성 |
| `refiner.ts` | 개별 아이템 다듬기 |

### 대규모 프로젝트 청크 분석

프로젝트 컨텍스트가 100KB를 초과하면 서브 프로젝트별로 분할 분석:

```
1. getProjectContextsBySubProject() — 1단계 디렉토리 기준 그룹핑
2. mergeSmallChunks() — 50KB 미만 소규모 그룹 병합
3. 각 청크를 개별 AI 호출로 분석
4. 결과 병합 → DB 저장
```

## 데이터베이스

SQLite (`better-sqlite3`), WAL 모드.

**테이블**: projects, brainstorms, items, conversations, memos, prompts, project_context

**아이템 트리**: `items.parent_id` 자기참조로 트리 구조 표현

## 프로젝트 스캔

`src/lib/scanner.ts` — 재귀적 파일 스캐너

- 우선순위: 프로젝트 설정 > 문서 > 엔트리 포인트 > 설정 > 소스코드
- 제한: 파일당 100KB, 총 1MB
- SSE 스트리밍으로 실시간 진행률 전달
- 스캔 결과는 `project_context` 테이블에 저장

## MCP Server

`src/lib/mcp/` — 6개 도구 제공

| 도구 | 설명 |
|------|------|
| `get-next-task` | 다음 실행 가능한 작업 |
| `get-project-context` | 프로젝트 전체 구조 |
| `get-prompt` | 특정 항목 프롬프트 |
| `report-completion` | 작업 완료 보고 |
| `update-status` | 상태 변경 |
| `list-projects` | 프로젝트 목록 |
