import { getDb } from '../index';

const MEMO_ID = 'global-memo';

export function getGlobalMemo(): string {
  const db = getDb();
  const row = db.prepare('SELECT content FROM global_memos WHERE id = ?').get(MEMO_ID) as { content: string } | undefined;
  return row?.content ?? '';
}

export function saveGlobalMemo(content: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM global_memos WHERE id = ?').get(MEMO_ID);
  if (existing) {
    db.prepare('UPDATE global_memos SET content = ?, updated_at = ? WHERE id = ?').run(content, now, MEMO_ID);
  } else {
    db.prepare('INSERT INTO global_memos (id, content, updated_at) VALUES (?, ?, ?)').run(MEMO_ID, content, now);
  }
}
