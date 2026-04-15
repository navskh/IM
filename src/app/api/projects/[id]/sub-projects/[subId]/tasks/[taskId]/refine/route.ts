import { NextRequest, NextResponse } from 'next/server';
import { getTask } from '@/lib/db/queries/tasks';
import { getProject } from '@/lib/db/queries/projects';
import { runAgent } from '@/lib/ai/client';
import { ensureDb } from '@/lib/db';

type RefineCommand = 'continue' | 'tidy' | 'split' | 'to-questions' | 'summarize' | 'custom';

function buildInstruction(cmd: RefineCommand, customText?: string): string {
  switch (cmd) {
    case 'continue':
      return '아래 노트의 흐름을 자연스럽게 이어서 덧붙일 한 단락(또는 bullet 몇 개)을 마크다운으로 작성하세요. 설명은 빼고 이어질 내용만 출력.';
    case 'tidy':
      return '아래 선택 영역의 뜻을 바꾸지 않고 깔끔하게 다듬어 주세요. 설명 없이 다듬어진 본문만 마크다운으로 출력.';
    case 'split':
      return '아래 선택 영역(또는 노트 전체)을 구체적인 할 일 단위의 체크박스 리스트로 변환하세요. 각 항목은 "- [ ] "로 시작. 설명 없이 리스트만 출력.';
    case 'to-questions':
      return '아래 내용에서 애매하거나 결정이 필요한 부분을 찾아 명확하게 해줄 질문 목록으로 바꿔주세요. "- Q. "로 시작하는 bullet로 출력. 설명 생략.';
    case 'summarize':
      return '아래 내용을 3줄 이내로 요약하세요. bullet 3개. 설명 없이 요약만.';
    case 'custom':
      return customText?.trim() || '아래 내용을 개선해주세요.';
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string; taskId: string }> },
) {
  await ensureDb();
  const { id: projectId, taskId } = await params;
  const body = await request.json() as { command?: RefineCommand; customText?: string; selection?: string; note?: string };

  if (!body.command) {
    return NextResponse.json({ error: 'command is required' }, { status: 400 });
  }

  const task = getTask(taskId);
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const project = getProject(projectId);
  const aiPolicy = project?.ai_context ? `\n\nProject AI Policy:\n${project.ai_context}` : '';
  const instruction = buildInstruction(body.command, body.customText);
  const selection = body.selection?.trim();
  const note = body.note ?? task.description ?? '';

  const prompt = `당신은 사용자의 노트 작성을 돕는 보조자입니다. 한국어로 답하세요.
${aiPolicy}

[태스크]
제목: ${task.title}

[명령]
${instruction}

${selection
  ? `[선택 영역]\n${selection}\n\n[노트 전체 컨텍스트]\n${note}`
  : `[노트 전체]\n${note}`}

중요: 답변은 노트에 그대로 삽입될 마크다운 텍스트만 출력하세요. 설명·전제·서론·결론 금지.`;

  try {
    const agentType = project?.agent_type || 'claude';
    // Refine is a pure text-tidying task — no repo exploration or tool use.
    // Skip cwd so the project's CLAUDE.md isn't loaded into context, and run
    // against a faster model. Keeps latency well under the 90s budget.
    const result = await runAgent(agentType, prompt, undefined, undefined, {
      timeoutMs: 90000,
      model: 'sonnet',
    });
    return NextResponse.json({ result: result.trim() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI 호출 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
