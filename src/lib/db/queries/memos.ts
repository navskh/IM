import { getDb } from '../index';
import { generateId } from '../../utils/id';
import type { IMemo } from '@/types';

export function getMemos(projectId: string, onlyUnresolved = false): IMemo[] {
  const db = getDb();
  const whereClause = onlyUnresolved
    ? 'WHERE project_id = ? AND is_resolved = 0'
    : 'WHERE project_id = ?';

  return db.prepare(
    `SELECT * FROM memos ${whereClause} ORDER BY created_at ASC`
  ).all(projectId) as IMemo[];
}

export function createMemo(data: {
  project_id: string;
  conversation_id?: string;
  anchor_text: string;
  question: string;
}): IMemo {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO memos (id, project_id, conversation_id, anchor_text, question, is_resolved, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(id, data.project_id, data.conversation_id ?? null, data.anchor_text, data.question, now, now);

  return db.prepare('SELECT * FROM memos WHERE id = ?').get(id) as IMemo;
}

export function resolveMemos(projectId: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE memos SET is_resolved = 1, updated_at = ? WHERE project_id = ? AND is_resolved = 0`
  ).run(now, projectId);
}

export function createMemosFromQuestions(
  projectId: string,
  conversationId: string,
  questions: { anchor_text: string; question: string }[],
): IMemo[] {
  const db = getDb();
  const memos: IMemo[] = [];

  const insertMemo = db.prepare(
    `INSERT INTO memos (id, project_id, conversation_id, anchor_text, question, is_resolved, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
  );

  const insertAll = db.transaction(() => {
    for (const q of questions) {
      const id = generateId();
      const now = new Date().toISOString();
      insertMemo.run(id, projectId, conversationId, q.anchor_text, q.question, now, now);
      memos.push(db.prepare('SELECT * FROM memos WHERE id = ?').get(id) as IMemo);
    }
  });

  insertAll();
  return memos;
}
