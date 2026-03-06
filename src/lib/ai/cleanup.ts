import { runClaude, extractJson, type IStructuredItem } from './client';
import { replaceItems, getItemTree } from '../db/queries/items';
import type { IItemTree } from '@/types';

function serializeItems(items: IItemTree[], depth = 0): string {
  const lines: string[] = [];
  for (const item of items) {
    const indent = '  '.repeat(depth);
    const status = item.status || 'pending';
    lines.push(`${indent}- [${item.item_type}/${item.priority}/${status}] ${item.title}: ${item.description || ''}`);
    if (item.children && item.children.length > 0) {
      lines.push(serializeItems(item.children, depth + 1));
    }
  }
  return lines.join('\n');
}

function countItems(items: IItemTree[]): number {
  let count = 0;
  for (const item of items) {
    count++;
    if (item.children) count += countItems(item.children);
  }
  return count;
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

export async function cleanupItems(
  projectId: string,
  brainstormId: string,
  items: IItemTree[],
  brainstormContent: string,
): Promise<{ items: IItemTree[]; changed: boolean }> {
  const serialized = serializeItems(items);
  const beforeCount = countItems(items);

  const prompt = `You are a JSON-only deduplication machine. You NEVER respond with text, explanations, or conversation.
You ALWAYS output ONLY a raw JSON array, nothing else.

Your job: clean up the structured item tree below by removing duplicates and merging similar items.

Schema per item:
{ "title": string, "description": string, "item_type": "feature"|"task"|"bug"|"idea"|"note", "priority": "high"|"medium"|"low", "status": "pending"|"in_progress"|"done", "children": [same schema] }

Rules:
- Output MUST start with [ and end with ]
- No markdown fences, no explanation, no text before or after the JSON
- MERGE items that describe the same concept (combine their descriptions, keep the more specific title)
- REMOVE exact or near-exact duplicates (keep the one with more detail)
- PRESERVE the status of items — if one copy is "done" and another is "pending", keep "done"
- PRESERVE the hierarchy — keep parent-child relationships logical
- Keep titles concise (under 50 chars)
- Do NOT add new items that weren't in the original
- Do NOT remove items just because they seem unimportant — only remove TRUE duplicates
- If the brainstorming context is provided, use it to understand which items are actually the same concept

${brainstormContent ? `사용자의 브레인스토밍 메모:\n${brainstormContent}\n\n` : ''}현재 구조화된 항목 (중복 제거 및 병합하세요):
${serialized}`;

  const resultText = await runClaude(prompt);
  const json = extractJson(resultText, 'array');
  const cleaned = JSON.parse(json) as IStructuredItem[];

  const afterCount = cleaned.reduce((sum, item) => sum + 1 + countStructuredChildren(item), 0);
  const changed = afterCount !== beforeCount;

  const dbItems = mapToDbFormat(cleaned);
  const tree = replaceItems(projectId, brainstormId, dbItems);

  return { items: tree, changed };
}

function countStructuredChildren(item: IStructuredItem): number {
  if (!item.children) return 0;
  return item.children.reduce((sum, child) => sum + 1 + countStructuredChildren(child), 0);
}
