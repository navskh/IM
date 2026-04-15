import { NextRequest, NextResponse } from 'next/server';
import { getTaskConversations, addTaskConversation } from '@/lib/db/queries/task-conversations';
import { getTask } from '@/lib/db/queries/tasks';
import { getBrainstorm } from '@/lib/db/queries/brainstorms';
import { getProject } from '@/lib/db/queries/projects';
import { runAgent } from '@/lib/ai/client';
import { ensureDb } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string; taskId: string }> },
) {
  await ensureDb();
  const { taskId } = await params;
  const conversations = getTaskConversations(taskId);
  return NextResponse.json(conversations);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string; taskId: string }> },
) {
  await ensureDb();
  const { id: projectId, taskId } = await params;
  const body = await request.json();

  if (!body.message || typeof body.message !== 'string') {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  const task = getTask(taskId);
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Save user message
  const userMsg = addTaskConversation(taskId, 'user', body.message);

  // Build context for AI
  const history = getTaskConversations(taskId);
  const brainstorm = getBrainstorm(projectId);
  const project = getProject(projectId);

  const aiPolicy = project?.ai_context ? `\n\nProject AI Policy:\n${project.ai_context}` : '';

  const systemPrompt = `당신은 사용자가 자기 태스크 "노트"를 다듬는 것을 돕는 보조자입니다.
사용자는 터미널 Claude Code에서 실제 작업을 수행하며, IM에서는 태스크의 맥락·배경·결정사항·질문 등을 자유롭게 메모합니다.
당신의 역할:
  - 사용자가 질문하면 간결하게 답한다 (긴 설교 금지)
  - 사용자가 "이 부분 정리해줘" 같은 요청을 하면 노트에 바로 삽입 가능한 형태(마크다운)로 답한다
  - 공식 프롬프트를 만들려 하지 말 것. 사용자의 생각을 **정리·명확화**하는 역할만
응답은 한국어로.
${aiPolicy}
Task: ${task.title}
Note(현재):
${task.description || '(비어있음)'}
Status: ${task.status}
${brainstorm?.content ? `\nBrainstorming context:\n${brainstorm.content.slice(0, 3000)}` : ''}`;

  const conversationText = history
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  try {
    const agentType = project?.agent_type || 'claude';
    const cwd = project?.project_path || undefined;
    const aiResponse = await runAgent(agentType, `${systemPrompt}\n\nConversation:\n${conversationText}`, undefined, undefined, { cwd });
    const trimmed = aiResponse.trim();
    if (!trimmed) {
      const fallbackMsg = addTaskConversation(taskId, 'assistant', '(AI 응답을 생성하지 못했습니다. 다시 시도해주세요.)');
      return NextResponse.json({ userMessage: userMsg, aiMessage: fallbackMsg });
    }
    const aiMsg = addTaskConversation(taskId, 'assistant', trimmed);
    return NextResponse.json({ userMessage: userMsg, aiMessage: aiMsg });
  } catch {
    const errorMsg = addTaskConversation(taskId, 'assistant', '(AI 호출에 실패했습니다. Claude CLI가 설치되어 있는지 확인해주세요.)');
    return NextResponse.json({ userMessage: userMsg, aiMessage: errorMsg });
  }
}
