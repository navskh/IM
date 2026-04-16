import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ensureDb } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  await ensureDb();
  await params; // validate route
  const body = await request.json() as { orderedIds?: string[] };
  if (!Array.isArray(body.orderedIds) || body.orderedIds.length === 0) {
    return NextResponse.json({ error: 'orderedIds array required' }, { status: 400 });
  }

  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare('UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?');
  for (let i = 0; i < body.orderedIds.length; i++) {
    stmt.run(i, now, body.orderedIds[i]);
  }

  return NextResponse.json({ ok: true });
}
