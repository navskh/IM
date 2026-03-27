import { NextRequest, NextResponse } from 'next/server';
import { getGlobalMemo, saveGlobalMemo } from '@/lib/db/queries/global-memo';
import { ensureDb } from '@/lib/db';

export async function GET() {
  await ensureDb();
  const content = getGlobalMemo();
  return NextResponse.json({ content });
}

export async function PUT(request: NextRequest) {
  await ensureDb();
  const body = await request.json();
  const content = typeof body.content === 'string' ? body.content : '';
  saveGlobalMemo(content);
  return NextResponse.json({ content });
}
