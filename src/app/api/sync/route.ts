import { NextRequest, NextResponse } from 'next/server';
import { getSyncDir } from '@/lib/utils/paths';
import * as git from '@/lib/sync/git';
import { exportToFile } from '@/lib/sync/exporter';
import { importFromFile, backupDb } from '@/lib/sync/importer';
import { ensureDb } from '@/lib/db';
import path from 'path';
import fs from 'fs';

const SYNC_FILE = 'im-data.json';

// GET: sync status
export async function GET() {
  await ensureDb();
  const syncDir = getSyncDir();
  const initialized = git.isGitRepo(syncDir);

  if (!initialized) {
    return NextResponse.json({ initialized: false });
  }

  const remoteUrl = await git.getRemoteUrl(syncDir).catch(() => null);
  const lastCommit = await git.getLastCommitInfo(syncDir).catch(() => null);
  const hasData = fs.existsSync(path.join(syncDir, SYNC_FILE));

  return NextResponse.json({
    initialized: true,
    remoteUrl,
    lastCommit,
    hasData,
  });
}

// POST: push or pull
export async function POST(request: NextRequest) {
  await ensureDb();
  const body = await request.json();
  const { action, repoUrl } = body;

  const syncDir = getSyncDir();

  // Init
  if (action === 'init') {
    if (!repoUrl) {
      return NextResponse.json({ error: 'repoUrl required' }, { status: 400 });
    }
    if (git.isGitRepo(syncDir)) {
      return NextResponse.json({ error: 'Already initialized' }, { status: 400 });
    }

    try {
      const tmpDir = syncDir + '-tmp-' + Date.now();
      let cloned = false;
      try {
        await git.gitClone(repoUrl, tmpDir);
        const entries = fs.readdirSync(tmpDir, { withFileTypes: true });
        for (const e of fs.readdirSync(syncDir)) {
          fs.rmSync(path.join(syncDir, e), { recursive: true, force: true });
        }
        for (const e of entries) {
          fs.renameSync(path.join(tmpDir, e.name), path.join(syncDir, e.name));
        }
        fs.rmSync(tmpDir, { recursive: true, force: true });
        cloned = true;
      } catch {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        await git.gitInit(syncDir);
        await git.gitAddRemote(syncDir, repoUrl);
        cloned = true;
      }

      if (cloned && !fs.existsSync(path.join(syncDir, SYNC_FILE))) {
        fs.writeFileSync(path.join(syncDir, '.gitignore'), '.DS_Store\n', 'utf-8');
        await exportToFile(path.join(syncDir, SYNC_FILE));
        await git.gitAdd(syncDir, ['.gitignore', SYNC_FILE]);
        await git.gitCommit(syncDir, 'sync: initial export');
        await git.gitPush(syncDir, true).catch(() => {});
      }

      return NextResponse.json({ success: true });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
  }

  if (!git.isGitRepo(syncDir)) {
    return NextResponse.json({ error: 'Sync not initialized' }, { status: 400 });
  }

  // Push
  if (action === 'push') {
    try {
      const filePath = path.join(syncDir, SYNC_FILE);
      await exportToFile(filePath);
      await git.gitAdd(syncDir, [SYNC_FILE]);
      const msg = `sync: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`;
      try {
        await git.gitCommit(syncDir, msg);
      } catch (err) {
        const m = (err as Error).message;
        if (m.includes('nothing to commit') || m.includes('no changes')) {
          return NextResponse.json({ success: true, message: 'Already up to date' });
        }
        throw err;
      }
      await git.gitPush(syncDir, false);
      return NextResponse.json({ success: true, message: 'Pushed successfully' });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
  }

  // Pull
  if (action === 'pull') {
    try {
      await git.gitPull(syncDir);
      const filePath = path.join(syncDir, SYNC_FILE);
      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: 'No sync data found. Push from another machine first.' }, { status: 404 });
      }
      await backupDb();
      await importFromFile(filePath);
      return NextResponse.json({ success: true, message: 'Pulled and imported. Refresh to see changes.' });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
