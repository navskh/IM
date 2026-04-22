import { NextRequest, NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db';
import { listDistributionHistory } from '@/lib/db/queries/distribution-history';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await ensureDb();
  const { id } = await params;
  const items = listDistributionHistory(id);
  return NextResponse.json({ items });
}
