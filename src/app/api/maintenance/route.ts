import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ensureDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Runs daily housekeeping tasks. Called once on app mount (from the dashboard).
 *
 * 1. Today auto-carry: un-done tasks that are still is_today=1 stay marked.
 *    Done/archived tasks with is_today=1 get cleared.
 * 2. Done auto-archive: tasks with status='done' older than 14 days get archived.
 */
export async function POST() {
  await ensureDb();
  const db = getDb();
  const now = new Date().toISOString();

  // 1. Clear is_today on finished tasks (done/archived stay, but no longer "today")
  const clearedToday = db.prepare(`
    UPDATE tasks SET is_today = 0, updated_at = ?
    WHERE is_today = 1 AND (status = 'done' OR is_archived = 1)
  `).run(now);

  // 2. Auto-archive done tasks older than 14 days
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const autoArchived = db.prepare(`
    UPDATE tasks SET is_archived = 1, is_today = 0, updated_at = ?
    WHERE status = 'done' AND is_archived = 0 AND updated_at < ?
  `).run(now, cutoff);

  return NextResponse.json({
    todayCleared: clearedToday.changes ?? 0,
    autoArchived: autoArchived.changes ?? 0,
  });
}
