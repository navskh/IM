import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db/queries/projects';
import { getProjectContexts, replaceProjectContexts } from '@/lib/db/queries/context';
import { scanProjectDirectory } from '@/lib/scanner';
import { getFileCategory } from '@/lib/scanner';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const contexts = getProjectContexts(id);
  if (contexts.length === 0) {
    return NextResponse.json({ exists: false, files: [], total: 0, totalSize: 0, scannedAt: null });
  }

  const files = contexts.map(c => ({
    file_path: c.file_path,
    size: c.content.length,
    category: getFileCategory(c.file_path),
    folder: getFolder(c.file_path),
  }));

  return NextResponse.json({
    exists: true,
    files,
    total: contexts.length,
    totalSize: contexts.reduce((s, c) => s + c.content.length, 0),
    scannedAt: contexts[0]?.scanned_at || null,
  });
}

function getFolder(filePath: string): string {
  const parts = filePath.split('/');
  if (parts.length <= 1 || filePath.startsWith('__')) return '(root)';
  return parts[0];
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (!project.project_path) {
    return NextResponse.json({ error: '프로젝트 경로가 설정되지 않았습니다' }, { status: 400 });
  }

  try {
    const scanned = scanProjectDirectory(project.project_path);
    const contexts = replaceProjectContexts(id, scanned);

    return NextResponse.json({
      files: contexts.map(c => ({
        file_path: c.file_path,
        size: c.content.length,
      })),
      total: contexts.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Scan failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
