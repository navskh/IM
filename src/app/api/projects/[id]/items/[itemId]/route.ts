import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/index';
import { updateItem } from '@/lib/db/queries/items';
import type { IItem, ItemStatus } from '@/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { itemId } = await params;
  const db = getDb();
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) as IItem | undefined;

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id: projectId, itemId } = await params;
  const body = await request.json();
  const db = getDb();

  const item = db.prepare('SELECT * FROM items WHERE id = ? AND project_id = ?')
    .get(itemId, projectId) as IItem | undefined;

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  const updates: Parameters<typeof updateItem>[1] = {};

  if (body.status !== undefined) {
    updates.status = body.status as ItemStatus;
  }

  if (body.is_locked !== undefined) {
    updates.is_locked = Boolean(body.is_locked);

    // If locking parent, also lock all children recursively
    if (body.is_locked) {
      lockChildrenRecursive(db, itemId, true);
    }
  }

  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.priority !== undefined) updates.priority = body.priority;

  // Auto-lock on completion
  if (body.status === 'done') {
    updates.is_locked = true;
  }

  const updated = updateItem(itemId, updates);
  return NextResponse.json(updated);
}

function lockChildrenRecursive(db: ReturnType<typeof getDb>, parentId: string, locked: boolean) {
  const now = new Date().toISOString();
  const children = db.prepare('SELECT id FROM items WHERE parent_id = ?').all(parentId) as { id: string }[];

  for (const child of children) {
    db.prepare('UPDATE items SET is_locked = ?, updated_at = ? WHERE id = ?')
      .run(locked ? 1 : 0, now, child.id);
    lockChildrenRecursive(db, child.id, locked);
  }
}
