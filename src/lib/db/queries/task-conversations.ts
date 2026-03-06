import { getDb } from '../index';
import { generateId } from '../../utils/id';
import type { ITaskConversation } from '@/types';

export function getTaskConversations(taskId: string): ITaskConversation[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM task_conversations WHERE task_id = ? ORDER BY created_at ASC'
  ).all(taskId) as ITaskConversation[];
}

export function addTaskConversation(taskId: string, role: 'assistant' | 'user', content: string): ITaskConversation {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO task_conversations (id, task_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, taskId, role, content, now);

  return db.prepare('SELECT * FROM task_conversations WHERE id = ?').get(id) as ITaskConversation;
}

export function deleteTaskConversations(taskId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM task_conversations WHERE task_id = ?').run(taskId);
}
