import { runStructure, runStructureWithQuestions, runAnalysis, runClaude, extractJson, type IStructuredItem, type OnTextChunk, type OnRawEvent } from './client';
import { replaceItems, appendItems, getItemTree } from '../db/queries/items';
import { getRecentConversations, addMessage } from '../db/queries/conversations';
import {
  getProjectContextSummary,
  getProjectContextsBySubProject,
  buildSubProjectSummary,
} from '../db/queries/context';
import { resolveMemos, createMemosFromQuestions } from '../db/queries/memos';
import type { IItemTree, IMemo, IConversation } from '@/types';

const AI_CONTEXT_LIMIT = 150_000; // 150KB - threshold for chunking
const PHASE3_CONTEXT_LIMIT = 300_000; // 300KB - Phase 3 final structuring (hub doc can be large)
const AI_CHUNK_LIMIT = 80_000; // 80KB - max context per AI call

export async function structureBrainstorm(
  projectId: string,
  brainstormId: string,
  content: string,
): Promise<IItemTree[]> {
  if (!content.trim()) {
    return [];
  }

  const projectContext = getProjectContextSummary(projectId) || undefined;
  const structured = await runStructure(content, projectContext);

  const dbItems = mapToDbFormat(structured);

  return replaceItems(projectId, brainstormId, dbItems);
}

export async function structureWithChat(
  projectId: string,
  brainstormId: string,
  content: string,
): Promise<{ items: IItemTree[]; memos: IMemo[]; message: IConversation | null }> {
  // Always use single mode for auto-structuring (triggered by brainstorming edits).
  // Multi-agent analysis is only used via streaming endpoint (structureWithChatDirect).
  const projectContext = getProjectContextSummary(projectId) || undefined;
  const safeContext = projectContext ? truncateContext(projectContext, AI_CONTEXT_LIMIT) : undefined;
  return structureSingle(projectId, brainstormId, content, safeContext);
}

/**
 * Streaming structure with direct SSE callback.
 * Instead of async generator, takes a `send` callback to emit SSE events directly.
 * This avoids timing issues with generator yield + async queue.
 */
export async function structureWithChatDirect(
  projectId: string,
  brainstormId: string,
  content: string,
  send: (event: string, data: unknown) => void | Promise<void>,
): Promise<void> {
  const projectContext = getProjectContextSummary(projectId) || undefined;
  const contextSize = projectContext?.length || 0;

  await send('status', { message: '컨텍스트 크기 확인 중...' });

  const onText: OnTextChunk = (text) => {
    send('ai_text', { text });
  };

  const onRawEvent: OnRawEvent = (event) => {
    send('ai_event', event);
  };

  if (contextSize <= AI_CONTEXT_LIMIT) {
    await send('status', { message: 'AI 구조화 중...', mode: 'single' });

    const history = getRecentConversations(projectId, 20);
    const historyForAi = history.map(h => ({ role: h.role, content: h.content }));
    const safeContext = projectContext ? truncateContext(projectContext, AI_CONTEXT_LIMIT) : undefined;

    const existingItems = getItemTree(projectId);
    const existingContext = existingItems.length > 0
      ? serializeExistingItems(existingItems)
      : undefined;

    const result = await runStructureWithQuestions(content, historyForAi, safeContext, onText, onRawEvent, existingContext);

    const dbItems = mapToDbFormat(result.items as IStructuredItem[]);
    const tree = replaceItems(projectId, brainstormId, dbItems);
    resolveMemos(projectId);

    let aiMessage: IConversation | null = null;
    let memos: IMemo[] = [];
    if (result.questions.length > 0) {
      const messageContent = result.questions
        .map((q, i) => `${i + 1}. ${q.question}`)
        .join('\n');
      aiMessage = addMessage(projectId, 'assistant', messageContent);
      memos = createMemosFromQuestions(projectId, aiMessage.id, result.questions);
    }

    await send('done', { items: tree, memos, message: aiMessage });
    return;
  }

  // ============================================================
  // 3-Phase Multi-Agent Analysis
  // ============================================================
  const subProjects = getProjectContextsBySubProject(projectId);
  const brainstormContext = content.trim()
    ? `\n\n사용자의 브레인스토밍 메모:\n${content}`
    : '';

  // Send phase list to frontend
  await send('phase_list', {
    phases: [
      { name: '전체 아키텍처 분석', status: 'pending' },
      { name: `서브 프로젝트 병렬 분석 (${subProjects.length}개)`, status: 'pending' },
      { name: '최종 구조화', status: 'pending' },
    ],
  });

  // Send sub-project list
  await send('chunk_list', {
    chunks: subProjects.map((c, i) => ({
      name: c.name,
      index: i + 1,
      fileCount: c.contexts.length,
    })),
    total: subProjects.length,
  });

  // ----------------------------------------------------------
  // Phase 1: Build hub document from docs/configs
  // ----------------------------------------------------------
  await send('phase_update', { index: 0, status: 'active' });
  await send('status', { message: 'Phase 1: 문서/설정 기반 아키텍처 분석 중...' });

  // Collect root files + all docs/configs for overview
  const rootSub = subProjects.find(s => s.name === '(root)');
  const rootContext = rootSub ? truncateContext(buildSubProjectSummary(rootSub), AI_CHUNK_LIMIT) : '';

  // Also collect file listing for all sub-projects
  const projectFileTree = subProjects
    .map(s => `[${s.name}] (${s.contexts.length}개 파일)\n${s.contexts.map(c => `  ${c.file_path}`).join('\n')}`)
    .join('\n\n');

  const phase1Prompt = `당신은 소프트웨어 프로젝트 아키텍트입니다. 아래 프로젝트의 문서와 설정 파일을 분석하여 "프로젝트 개요 문서"를 작성하세요.

이 문서는 다른 AI 에이전트들이 각 서브 프로젝트를 분석할 때 참조하는 중추 문서가 됩니다.

다음 내용을 포함해주세요:
1. 프로젝트 전체 목적과 구조
2. 기술 스택 (프레임워크, 언어, 주요 라이브러리)
3. 서브 프로젝트 간의 관계와 의존성
4. 아키텍처 패턴 (모노레포, 마이크로서비스, 등)
5. 주요 컨벤션과 규칙
6. 배포/인프라 구조 (파악 가능한 경우)

한국어로 작성하세요. Markdown 형식으로 작성하세요.
${brainstormContext}

=== 프로젝트 파일 트리 ===
${projectFileTree}

=== 루트 문서/설정 파일 ===
${rootContext}`;

  let hubDocument = '';
  try {
    hubDocument = await runAnalysis(phase1Prompt, onText, onRawEvent);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    hubDocument = `# 프로젝트 개요 (자동 생성 실패)\n오류: ${errMsg.slice(0, 300)}\n\n## 서브 프로젝트 목록\n${subProjects.map(s => `- ${s.name}`).join('\n')}`;
  }

  await send('phase_update', { index: 0, status: 'done' });
  await send('hub_document', { content: hubDocument });

  // ----------------------------------------------------------
  // Phase 2: Parallel sub-project analysis
  // ----------------------------------------------------------
  await send('phase_update', { index: 1, status: 'active' });
  await send('status', { message: 'Phase 2: 서브 프로젝트 병렬 분석 중...' });

  const CONCURRENCY = 2;
  const subAnalyses = new Map<string, string>();
  const nonRootSubs = subProjects.filter(s => s.name !== '(root)');

  // Process in batches of CONCURRENCY
  for (let batch = 0; batch < nonRootSubs.length; batch += CONCURRENCY) {
    const batchSubs = nonRootSubs.slice(batch, batch + CONCURRENCY);

    const batchPromises = batchSubs.map(async (sub, batchIdx) => {
      const globalIdx = batch + batchIdx;
      const subIdx = subProjects.indexOf(sub);

      await send('structuring_sub', {
        subProject: sub.name,
        current: globalIdx + 1,
        total: nonRootSubs.length,
        files: sub.contexts.map(c => c.file_path),
      });

      const subContext = truncateContext(buildSubProjectSummary(sub), AI_CHUNK_LIMIT);
      const phase2Prompt = `당신은 소프트웨어 분석가입니다. 아래 "프로젝트 개요 문서"를 참조하여 서브 프로젝트 "${sub.name}"의 소스코드를 분석하세요.

분석 결과를 다음 형식으로 작성하세요:
1. **역할**: 이 서브 프로젝트가 전체 시스템에서 하는 역할
2. **주요 기능**: 구현된 핵심 기능 목록 (각 기능의 구현 상태 포함)
3. **기술 스택**: 사용 중인 기술/라이브러리
4. **구현 상태**: done/in_progress/pending 판단 근거
5. **TODO/개선점**: 코드에서 발견된 TODO, 미구현 부분, 개선 가능 사항
6. **다른 서브 프로젝트와의 관계**: 의존하거나 의존받는 프로젝트

한국어로 작성하세요. Markdown 형식으로 작성하세요.

=== 프로젝트 개요 문서 (중추) ===
${truncateContext(hubDocument, 30_000)}

=== ${sub.name} 소스코드 ===
${subContext}`;

      try {
        // Each sub gets its own text stream tagged with sub name
        const subOnText: OnTextChunk = (text) => {
          send('ai_text', { text, subProject: sub.name });
        };

        const analysis = await runAnalysis(phase2Prompt, subOnText);
        subAnalyses.set(sub.name, analysis);

        await send('structuring_sub_done', {
          subProject: sub.name,
          current: globalIdx + 1,
          total: nonRootSubs.length,
          itemCount: 0,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[structurer] Phase 2 "${sub.name}" failed:`, errMsg);
        subAnalyses.set(sub.name, `# ${sub.name} (분석 실패)\n오류: ${errMsg.slice(0, 300)}`);

        await send('structuring_sub_done', {
          subProject: sub.name,
          current: globalIdx + 1,
          total: nonRootSubs.length,
          error: errMsg.slice(0, 200),
        });
      }
    });

    await Promise.all(batchPromises);
  }

  // Build complete hub document with all analyses
  const completeDocument = `${hubDocument}\n\n---\n\n# 서브 프로젝트 상세 분석\n\n${
    Array.from(subAnalyses.entries())
      .map(([name, analysis]) => `## ${name}\n\n${analysis}`)
      .join('\n\n---\n\n')
  }`;

  await send('phase_update', { index: 1, status: 'done' });
  await send('hub_document', { content: completeDocument });

  // ----------------------------------------------------------
  // Phase 3: Final structuring from complete hub document
  // ----------------------------------------------------------
  await send('phase_update', { index: 2, status: 'active' });
  await send('status', { message: 'Phase 3: 중추 문서 기반 최종 구조화 중...' });
  await send('ai_text_reset', {});

  const phase3Prompt = `You are a JSON-only structuring machine. You NEVER respond with text, explanations, or conversation.
You ALWAYS output ONLY a raw JSON array, nothing else.

Your job: convert the comprehensive project analysis document below into a structured JSON tree.

Schema per item:
{ "title": string, "description": string, "item_type": "feature"|"task"|"bug"|"idea"|"note", "priority": "high"|"medium"|"low", "status": "pending"|"in_progress"|"done", "children": [same schema] }

Rules:
- Output MUST start with [ and end with ]
- No markdown fences, no explanation, no text before or after the JSON
- Top-level items should be sub-projects (one per analyzed project)
- Each top-level item should have children representing features/tasks/bugs found in that sub-project
- Keep titles concise (under 50 chars)
- Judge status based on the analysis:
  - "done": fully implemented as described
  - "in_progress": partially implemented or has TODOs
  - "pending": not yet started or only planned
- Prioritize items that have TODOs or are in_progress as "high" priority
- Include bugs, improvements, and missing features mentioned in the analysis
${brainstormContext}

=== 프로젝트 분석 문서 ===
${truncateContext(completeDocument, PHASE3_CONTEXT_LIMIT)}`;

  try {
    const resultText = await runClaude(phase3Prompt, onText, onRawEvent);
    const json = extractJson(resultText, 'array');
    const structured = JSON.parse(json) as IStructuredItem[];

    const dbItems = mapToDbFormat(structured);
    const tree = appendItems(projectId, brainstormId, dbItems);
    resolveMemos(projectId);

    const summaryMsg = addMessage(
      projectId,
      'assistant',
      `3단계 분석 완료: ${nonRootSubs.length}개 서브 프로젝트를 병렬 분석 후 구조화했습니다.`,
    );

    await send('phase_update', { index: 2, status: 'done' });
    await send('done', { items: tree, memos: [], message: summaryMsg });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[structurer] Phase 3 failed:', errMsg);

    await send('phase_update', { index: 2, status: 'error' });
    await send('error', { error: `Phase 3 구조화 실패: ${errMsg.slice(0, 300)}` });
  }
}

// ============================================================
// Internal helpers
// ============================================================

async function structureSingle(
  projectId: string,
  brainstormId: string,
  content: string,
  projectContext?: string,
): Promise<{ items: IItemTree[]; memos: IMemo[]; message: IConversation | null }> {
  const history = getRecentConversations(projectId, 20);
  const historyForAi = history.map(h => ({
    role: h.role,
    content: h.content,
  }));

  const existingItems = getItemTree(projectId);
  const existingContext = existingItems.length > 0
    ? serializeExistingItems(existingItems)
    : undefined;

  const safeContext = projectContext ? truncateContext(projectContext, AI_CONTEXT_LIMIT) : undefined;
  const result = await runStructureWithQuestions(content, historyForAi, safeContext, undefined, undefined, existingContext);

  const dbItems = mapToDbFormat(result.items as IStructuredItem[]);
  const tree = replaceItems(projectId, brainstormId, dbItems);

  resolveMemos(projectId);

  let aiMessage: IConversation | null = null;
  let memos: IMemo[] = [];

  if (result.questions.length > 0) {
    const messageContent = result.questions
      .map((q, i) => `${i + 1}. ${q.question}`)
      .join('\n');

    aiMessage = addMessage(projectId, 'assistant', messageContent);
    memos = createMemosFromQuestions(projectId, aiMessage.id, result.questions);
  }

  return { items: tree, memos, message: aiMessage };
}

function serializeExistingItems(items: IItemTree[], depth = 0): string {
  if (items.length === 0) return '';
  const lines: string[] = [];
  for (const item of items) {
    const indent = '  '.repeat(depth);
    lines.push(`${indent}- [${item.item_type}/${item.priority}] ${item.title}: ${item.description || ''}`);
    if (item.children && item.children.length > 0) {
      lines.push(serializeExistingItems(item.children, depth + 1));
    }
  }
  return lines.join('\n');
}

function truncateContext(context: string, limit: number): string {
  if (context.length <= limit) return context;

  const fileSections = context.split(/(?=--- .+ ---\n)/);
  let result = '';

  for (const section of fileSections) {
    if (result.length + section.length > limit) {
      result += `\n\n--- (${fileSections.length - result.split('---').length / 2}개 파일 생략됨, 컨텍스트 크기 제한) ---\n`;
      break;
    }
    result += section;
  }

  return result;
}

function mapToDbFormat(items: IStructuredItem[]): Parameters<typeof replaceItems>[2] {
  return items.map((item) => ({
    parent_id: null,
    title: item.title,
    description: item.description,
    item_type: item.item_type,
    priority: item.priority,
    status: item.status,
    children: item.children ? mapToDbFormat(item.children) : undefined,
  }));
}
