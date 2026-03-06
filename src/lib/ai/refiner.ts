import { runClaude } from './client';
import { updateItem, addChildItems, getItemTree, deleteItem } from '../db/queries/items';
import { getBrainstorm } from '../db/queries/brainstorms';
import { getDb } from '../db/index';
import type { IItem, IItemTree } from '@/types';

interface RefineChild {
  title: string;
  description: string;
  item_type: 'feature' | 'task' | 'bug' | 'idea' | 'note';
  priority: 'high' | 'medium' | 'low';
  children?: RefineChild[];
}

interface RefineResult {
  title: string;
  description: string;
  children?: RefineChild[];
  remove_children?: boolean;
}

export async function refineItem(
  item: IItem,
  userMessage: string,
): Promise<{ title: string; description: string; tree: IItemTree[] }> {
  const brainstorm = getBrainstorm(item.project_id);

  // Get existing children info
  const db = getDb();
  const existingChildren = db.prepare(
    'SELECT id, title, description, item_type, priority FROM items WHERE parent_id = ?'
  ).all(item.id) as Pick<IItem, 'id' | 'title' | 'description' | 'item_type' | 'priority'>[];

  const childrenInfo = existingChildren.length > 0
    ? `\n\n현재 하위 항목 (${existingChildren.length}개):\n${existingChildren.map((c, i) => `${i + 1}. [${c.item_type}] ${c.title}: ${c.description}`).join('\n')}`
    : '\n\n현재 하위 항목: 없음';

  const systemPrompt = `You are a task refinement assistant. The user wants to modify a task item and potentially its sub-items.
You ALWAYS output ONLY a raw JSON object, nothing else.

Output schema:
{
  "title": string,
  "description": string,
  "children": [{ "title": string, "description": string, "item_type": "feature"|"task"|"bug"|"idea"|"note", "priority": "high"|"medium"|"low", "children": [...] }],
  "remove_children": boolean
}

Rules:
- Output MUST be a JSON object
- No markdown fences, no explanation, no text before or after the JSON
- Keep titles concise (under 50 chars)
- Write in Korean
- description should be detailed and actionable
- "children" is OPTIONAL: include it only if the user asks to add/restructure sub-items
- "remove_children" is OPTIONAL: set true only if the user explicitly asks to remove existing children before adding new ones
- If the user just wants to modify the title/description, omit "children"
- If the user asks to break down, detail, or expand the item, provide "children" array with sub-items`;

  const context = brainstorm?.content ? `\n\n브레인스토밍 원문:\n${brainstorm.content}` : '';

  const prompt = `${systemPrompt}\n\n현재 항목:
제목: ${item.title}
설명: ${item.description}
유형: ${item.item_type}
우선순위: ${item.priority}${childrenInfo}${context}

사용자 요청: ${userMessage}`;

  const resultText = await runClaude(prompt);

  const cleaned = resultText.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AI did not return valid JSON');
  }

  const parsed = JSON.parse(jsonMatch[0]) as RefineResult;

  // Update the item itself
  updateItem(item.id, {
    title: parsed.title,
    description: parsed.description,
  });

  // Handle children changes
  if (parsed.children && parsed.children.length > 0) {
    // If remove_children is set, delete existing children first
    if (parsed.remove_children && existingChildren.length > 0) {
      for (const child of existingChildren) {
        deleteItem(child.id);
      }
    }

    // Add new children
    addChildItems(item.project_id, item.id, parsed.children.map(c => ({
      parent_id: item.id,
      title: c.title,
      description: c.description,
      item_type: c.item_type,
      priority: c.priority,
      children: c.children?.map(mapChild) ?? undefined,
    })));
  }

  // Return updated tree
  const tree = getItemTree(item.project_id);

  return { title: parsed.title, description: parsed.description, tree };
}

function mapChild(c: RefineChild): {
  parent_id: null;
  title: string;
  description: string;
  item_type: RefineChild['item_type'];
  priority: RefineChild['priority'];
  children?: ReturnType<typeof mapChild>[];
} {
  return {
    parent_id: null,
    title: c.title,
    description: c.description,
    item_type: c.item_type,
    priority: c.priority,
    children: c.children?.map(mapChild),
  };
}
