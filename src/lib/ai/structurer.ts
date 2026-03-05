import { runStructure, runStructureWithQuestions, type IStructuredItem } from './client';
import { replaceItems } from '../db/queries/items';
import { getRecentConversations, addMessage } from '../db/queries/conversations';
import { resolveMemos, createMemosFromQuestions } from '../db/queries/memos';
import type { IItemTree, IMemo, IConversation } from '@/types';

export async function structureBrainstorm(
  projectId: string,
  brainstormId: string,
  content: string,
): Promise<IItemTree[]> {
  if (!content.trim()) {
    return [];
  }

  const structured = await runStructure(content);

  const dbItems = mapToDbFormat(structured);

  return replaceItems(projectId, brainstormId, dbItems);
}

export async function structureWithChat(
  projectId: string,
  brainstormId: string,
  content: string,
): Promise<{ items: IItemTree[]; memos: IMemo[]; message: IConversation | null }> {
  if (!content.trim()) {
    return { items: [], memos: [], message: null };
  }

  // Load recent conversation history
  const history = getRecentConversations(projectId, 20);
  const historyForAi = history.map(h => ({
    role: h.role,
    content: h.content,
  }));

  // AI call with questions
  const result = await runStructureWithQuestions(content, historyForAi);

  // Replace items in DB
  const dbItems = mapToDbFormat(result.items as IStructuredItem[]);
  const tree = replaceItems(projectId, brainstormId, dbItems);

  // Resolve old memos
  resolveMemos(projectId);

  // Build AI message from questions
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
