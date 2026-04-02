import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

const IGNORED = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '__pycache__',
  '.cache', '.tmp', '.DS_Store', 'coverage', '.turbo', '.vercel',
]);

export async function GET(request: NextRequest) {
  const dirPath = request.nextUrl.searchParams.get('path') || os.homedir();

  try {
    const resolved = path.resolve(dirPath);

    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ error: '경로가 존재하지 않습니다' }, { status: 404 });
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: '디렉토리가 아닙니다' }, { status: 400 });
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && !IGNORED.has(e.name))
      .map(e => ({
        name: e.name,
        path: path.join(resolved, e.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Check for project markers
    const hasPackageJson = fs.existsSync(path.join(resolved, 'package.json'));
    const hasReadme = fs.existsSync(path.join(resolved, 'README.md'));
    const hasGit = fs.existsSync(path.join(resolved, '.git'));

    return NextResponse.json({
      current: resolved,
      parent: path.dirname(resolved) !== resolved ? path.dirname(resolved) : null,
      dirs,
      isProject: hasPackageJson || hasReadme || hasGit,
    });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EPERM') {
      return NextResponse.json({
        error: '접근 권한이 없습니다',
        permissionError: true,
      }, { status: 403 });
    }
    return NextResponse.json({ error: '디렉토리를 읽을 수 없습니다' }, { status: 500 });
  }
}
