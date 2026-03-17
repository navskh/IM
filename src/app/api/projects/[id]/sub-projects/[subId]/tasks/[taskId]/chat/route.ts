import { NextRequest, NextResponse } from 'next/server';
import { getTaskConversations, addTaskConversation } from '@/lib/db/queries/task-conversations';
import { getTask } from '@/lib/db/queries/tasks';
import { getTaskPrompt } from '@/lib/db/queries/task-prompts';
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
  const prompt = getTaskPrompt(taskId);
  const brainstorm = getBrainstorm(projectId);
  const project = getProject(projectId);

  const aiPolicy = project?.ai_context ? `\n\nProject AI Policy:\n${project.ai_context}` : '';

  const systemPrompt = `You are a helpful assistant helping refine a development task. Respond in Korean. Be concise.
${aiPolicy}
Task: ${task.title}
Description: ${task.description}
Status: ${task.status}
${prompt?.content ? `Current prompt:\n${prompt.content}` : ''}
${brainstorm?.content ? `\nBrainstorming context:\n${brainstorm.content.slice(0, 3000)}` : ''}`;

  const conversationText = history
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  try {
    const agentType = project?.agent_type || 'claude';
    const aiResponse = await runAgent(agentType, `${systemPrompt}\n\nConversation:\n${conversationText}`);
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
