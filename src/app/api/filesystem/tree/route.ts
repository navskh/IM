import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const IGNORED = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '__pycache__',
  '.cache', '.tmp', '.DS_Store', 'coverage', '.turbo', '.vercel',
  '.idea', '.vscode', '.svn', '.hg',
]);

interface TreeEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  extension?: string;
}

export async function GET(request: NextRequest) {
  const dirPath = request.nextUrl.searchParams.get('path');

  if (!dirPath) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 });
  }

  try {
    const resolved = path.resolve(dirPath);

    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ error: 'Path does not exist' }, { status: 404 });
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: 'Not a directory' }, { status: 400 });
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const items: TreeEntry[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED.has(entry.name)) continue;

      const fullPath = path.join(resolved, entry.name);

      if (entry.isDirectory()) {
        items.push({
          name: entry.name,
          path: fullPath,
          type: 'directory',
        });
      } else if (entry.isFile()) {
        try {
          const fileStat = fs.statSync(fullPath);
          items.push({
            name: entry.name,
            path: fullPath,
            type: 'file',
            size: fileStat.size,
            extension: path.extname(entry.name).slice(1).toLowerCase() || undefined,
          });
        } catch {
          // skip unreadable files
        }
      }
    }

    // Sort: directories first, then alphabetically
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ path: resolved, entries: items });
  } catch {
    return NextResponse.json({ error: 'Cannot read directory' }, { status: 500 });
  }
}
