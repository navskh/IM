import { runStructureWithQuestions, type IStructuredItem } from './client';
import { replaceItems } from '../db/queries/items';
import { getRecentConversations, addMessage } from '../db/queries/conversations';
import { getBrainstorm } from '../db/queries/brainstorms';
import { resolveMemos, createMemosFromQuestions } from '../db/queries/memos';
import type { IItemTree, IMemo, IConversation } from '@/types';

export async function handleChatResponse(
  projectId: string,
  brainstormId: string,
  userMessage: string,
): Promise<{ items: IItemTree[]; memos: IMemo[]; messages: IConversation[] }> {
  // Save user message
  const userMsg = addMessage(projectId, 'user', userMessage);

  // Load brainstorm content
  const brainstorm = getBrainstorm(projectId);
  if (!brainstorm || !brainstorm.content.trim()) {
    return { items: [], memos: [], messages: [userMsg] };
  }

  // Resolve old memos before generating new ones
  resolveMemos(projectId);

  // Load full conversation history (limited to 20)
  const history = getRecentConversations(projectId, 20);
  const historyForAi = history.map(h => ({
    role: h.role,
    content: h.content,
  }));

  // AI call with updated conversation context
  const result = await runStructureWithQuestions(brainstorm.content, historyForAi);

  // Replace items in DB
  const dbItems = mapToDbFormat(result.items as IStructuredItem[]);
  const tree = replaceItems(projectId, brainstormId, dbItems);

  // Build AI response + new memos
  const newMessages: IConversation[] = [userMsg];
  let memos: IMemo[] = [];

  if (result.questions.length > 0) {
    const messageContent = result.questions
      .map((q, i) => `${i + 1}. ${q.question}`)
      .join('\n');

    const aiMsg = addMessage(projectId, 'assistant', messageContent);
    newMessages.push(aiMsg);
    memos = createMemosFromQuestions(projectId, aiMsg.id, result.questions);
  } else {
    // Even without questions, acknowledge the refinement
    const aiMsg = addMessage(projectId, 'assistant', '답변을 반영하여 구조를 업데이트했습니다.');
    newMessages.push(aiMsg);
  }

  return { items: tree, memos, messages: newMessages };
}

function mapToDbFormat(items: IStructuredItem[]): Parameters<typeof replaceItems>[2] {
  return items.map((item) => ({
    parent_id: null,
    title: item.title,
    description: item.description,
    item_type: item.item_type,
    priority: item.priority,
    children: item.children ? mapToDbFormat(item.children) : undefined,
  }));
}
