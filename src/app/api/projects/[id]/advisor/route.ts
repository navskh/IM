import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { getProject } from '@/lib/db/queries/projects';
import { getProjectConversations, addProjectConversation, clearProjectConversations } from '@/lib/db/queries/project-conversations';
import { buildProjectAdvisorPrompt, trimConversationHistory } from '@/lib/ai/project-context';
import { runAgent } from '@/lib/ai/client';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await ensureDb();
  const { id } = await params;
  const messages = getProjectConversations(id);
  return NextResponse.json(messages);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await ensureDb();
  const { id } = await params;
  const body = await request.json();

  if (!body.message || typeof body.message !== 'string') {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const userMsg = addProjectConversation(id, 'user', body.message);

  const systemPrompt = buildProjectAdvisorPrompt(id);
  const history = getProjectConversations(id);
  const trimmed = trimConversationHistory(history.map(m => ({ role: m.role, content: m.content })));
  const conversationText = trimmed
    .map(m => `${m.role === 'user' ? 'User' : m.role === 'system' ? 'System' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const fullPrompt = `${systemPrompt}\n\n=== CONVERSATION ===\n${conversationText}`;

  try {
    const agentType = project.agent_type || 'claude';
    const cwd = project.project_path || undefined;
    const aiResponse = await runAgent(agentType, fullPrompt, undefined, undefined, { cwd, timeoutMs: 120000 });
    const trimmedResponse = aiResponse.trim();
    if (!trimmedResponse) {
      const fallback = addProjectConversation(id, 'assistant', '(AI 응답을 생성하지 못했습니다. 다시 시도해주세요.)');
      return NextResponse.json({ userMessage: userMsg, aiMessage: fallback });
    }
    const aiMsg = addProjectConversation(id, 'assistant', trimmedResponse);
    return NextResponse.json({ userMessage: userMsg, aiMessage: aiMsg });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[advisor] AI call failed:', detail);
    const errorMsg = addProjectConversation(id, 'assistant', `⚠ AI 호출 실패: ${detail}\n\n**체크리스트**\n- Claude CLI가 PATH에 있는가? (\`claude --version\` 확인)\n- 네트워크 연결 / 로그인 상태?\n- Windows라면 \`claude.cmd\`가 \`where claude\`로 찾아지는지?`);
    return NextResponse.json({ userMessage: userMsg, aiMessage: errorMsg });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await ensureDb();
  const { id } = await params;
  clearProjectConversations(id);
  return NextResponse.json({ ok: true });
}
