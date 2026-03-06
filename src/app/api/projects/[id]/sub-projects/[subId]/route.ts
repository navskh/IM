import { NextRequest, NextResponse } from 'next/server';
import { getSubProject, updateSubProject, deleteSubProject } from '@/lib/db/queries/sub-projects';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  const { subId } = await params;
  const sp = getSubProject(subId);
  if (!sp) {
    return NextResponse.json({ error: 'Sub-project not found' }, { status: 404 });
  }
  return NextResponse.json(sp);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  const { subId } = await params;
  const body = await request.json();
  const sp = updateSubProject(subId, body);
  if (!sp) {
    return NextResponse.json({ error: 'Sub-project not found' }, { status: 404 });
  }
  return NextResponse.json(sp);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> },
) {
  const { subId } = await params;
  const deleted = deleteSubProject(subId);
  if (!deleted) {
    return NextResponse.json({ error: 'Sub-project not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
