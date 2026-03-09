import { getDb } from '../index';
import { generateId } from '../../utils/id';
import type { ITaskPrompt } from '../../../types';

export function getTaskPrompt(taskId: string): ITaskPrompt | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM task_prompts WHERE task_id = ?').get(taskId) as ITaskPrompt | undefined;
}

export function upsertTaskPrompt(taskId: string, content: string, promptType: 'manual' | 'ai_assisted' = 'manual'): ITaskPrompt {
  const db = getDb();
  const existing = getTaskPrompt(taskId);
  const now = new Date().toISOString();

  if (existing) {
    db.prepare(
      'UPDATE task_prompts SET content = ?, prompt_type = ?, updated_at = ? WHERE task_id = ?'
    ).run(content, promptType, now, taskId);
  } else {
    const id = generateId();
    db.prepare(
      'INSERT INTO task_prompts (id, task_id, content, prompt_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, taskId, content, promptType, now, now);
  }

  return getTaskPrompt(taskId)!;
}

export function deleteTaskPrompt(taskId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM task_prompts WHERE task_id = ?').run(taskId);
}
