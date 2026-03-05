import { getDb } from '../index';
import { generateId } from '../../utils/id';
import type { IPrompt } from '@/types';

export function getPrompt(itemId: string): IPrompt | undefined {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM prompts WHERE item_id = ? ORDER BY version DESC LIMIT 1'
  ).get(itemId) as IPrompt | undefined;
}

export function getPromptsByProject(projectId: string): IPrompt[] {
  const db = getDb();
  // Get latest version of each item's prompt
  return db.prepare(
    `SELECT p.* FROM prompts p
     INNER JOIN (
       SELECT item_id, MAX(version) as max_version
       FROM prompts WHERE project_id = ?
       GROUP BY item_id
     ) latest ON p.item_id = latest.item_id AND p.version = latest.max_version
     WHERE p.project_id = ?`
  ).all(projectId, projectId) as IPrompt[];
}

export function createPrompt(data: {
  project_id: string;
  item_id: string;
  content: string;
  prompt_type?: 'auto' | 'manual';
}): IPrompt {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  // Get next version number
  const existing = db.prepare(
    'SELECT MAX(version) as max_ver FROM prompts WHERE item_id = ?'
  ).get(data.item_id) as { max_ver: number | null } | undefined;
  const version = (existing?.max_ver ?? 0) + 1;

  db.prepare(
    `INSERT INTO prompts (id, project_id, item_id, content, prompt_type, version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.project_id, data.item_id, data.content, data.prompt_type ?? 'auto', version, now);

  return db.prepare('SELECT * FROM prompts WHERE id = ?').get(id) as IPrompt;
}

export function updatePromptContent(itemId: string, content: string): IPrompt {
  // Create a new manual version
  const db = getDb();
  const existing = getPrompt(itemId);
  if (!existing) {
    throw new Error('No prompt found for this item');
  }
  return createPrompt({
    project_id: existing.project_id,
    item_id: itemId,
    content,
    prompt_type: 'manual',
  });
}

export function deletePromptsByItem(itemId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM prompts WHERE item_id = ?').run(itemId);
}
