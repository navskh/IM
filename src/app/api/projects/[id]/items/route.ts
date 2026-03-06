import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db/queries/projects';
import { getItemTree, deleteItem, deleteItemsByProject, bulkUpdateStatus } from '@/lib/db/queries/items';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const tree = getItemTree(id);
  return NextResponse.json(tree);
}

// Bulk delete: DELETE /api/projects/[id]/items
// body: { itemIds: string[] } or { all: true }
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = await request.json();

  if (body.all) {
    deleteItemsByProject(id);
  } else if (Array.isArray(body.itemIds)) {
    for (const itemId of body.itemIds) {
      deleteItem(itemId);
    }
  } else {
    return NextResponse.json({ error: 'itemIds or all required' }, { status: 400 });
  }

  const tree = getItemTree(id);
  return NextResponse.json(tree);
}

// Bulk update status: PATCH /api/projects/[id]/items
// body: { status: 'done' | 'pending' | 'in_progress' }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = await request.json();
  if (!body.status) {
    return NextResponse.json({ error: 'status required' }, { status: 400 });
  }

  bulkUpdateStatus(id, body.status);
  const tree = getItemTree(id);
  return NextResponse.json(tree);
}
