import readline from 'readline';
import path from 'path';
import fs from 'fs';
import { getSyncDir } from '../utils/paths';
import * as git from './git';
import { exportToFile } from './exporter';
import { importFromFile, backupDb } from './importer';

const SYNC_FILE = 'im-data.json';

function ask(question: string, defaultValue?: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
    rl.question(prompt, answer => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

function printCounts(label: string, counts: Record<string, number>) {
  const parts = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}: ${v}`);
  console.log(`  ${label}: ${parts.join(', ') || 'empty'}`);
}

export async function syncInit() {
  const syncDir = getSyncDir();

  if (git.isGitRepo(syncDir)) {
    const remoteUrl = await git.getRemoteUrl(syncDir);
    console.log(`\n  Sync already initialized.`);
    if (remoteUrl) console.log(`  Remote: ${remoteUrl}`);
    console.log(`  Use "im sync push" or "im sync pull"\n`);
    return;
  }

  // Check git
  if (!await git.isGitInstalled()) {
    console.error('\n  Error: git is not installed. Please install git first.\n');
    process.exit(1);
  }

  let repoUrl = '';

  // Try gh CLI
  const ghAvailable = await git.isGhInstalled() && await git.isGhAuthenticated();

  if (ghAvailable) {
    const useGh = await ask('Create a new private GitHub repo? (Y/n)', 'Y');

    if (useGh.toLowerCase() !== 'n') {
      const repoName = await ask('Repository name', 'idea-manager-sync');

      console.log(`\n  Creating GitHub repo "${repoName}"...`);
      try {
        repoUrl = await git.ghCreateRepo(repoName);
        console.log(`  Created: ${repoUrl}`);
      } catch (err) {
        console.error(`  Failed to create repo: ${(err as Error).message}`);
        console.log('  Falling back to manual URL input.\n');
      }
    }
  }

  if (!repoUrl) {
    if (!ghAvailable) {
      console.log('\n  gh CLI not found — auto repo creation unavailable.');
      console.log('  Create a repo on GitHub first, then paste the URL below.');
      console.log('  (Install gh: https://cli.github.com)\n');
    }
    repoUrl = await ask('Enter git repository URL');
    if (!repoUrl) {
      console.error('\n  Error: Repository URL is required.\n');
      process.exit(1);
    }
  }

  // Clone into a temp dir, then move contents to sync dir
  console.log(`\n  Cloning to ${syncDir}...`);
  const tmpCloneDir = syncDir + '-tmp-' + Date.now();
  let cloned = false;

  try {
    await git.gitClone(repoUrl, tmpCloneDir);
    // Move contents from tmp to sync dir
    const entries = fs.readdirSync(tmpCloneDir, { withFileTypes: true });
    // Clean sync dir first
    for (const e of fs.readdirSync(syncDir)) {
      fs.rmSync(path.join(syncDir, e), { recursive: true, force: true });
    }
    for (const e of entries) {
      fs.renameSync(path.join(tmpCloneDir, e.name), path.join(syncDir, e.name));
    }
    fs.rmSync(tmpCloneDir, { recursive: true, force: true });
    cloned = true;
  } catch {
    // Clone failed — init locally + add remote
    fs.rmSync(tmpCloneDir, { recursive: true, force: true });
    try {
      await git.gitInit(syncDir);
      await git.gitAddRemote(syncDir, repoUrl);
      cloned = true;
    } catch (err2) {
      console.error(`  Failed: ${(err2 as Error).message}\n`);
      process.exit(1);
    }
  }

  // Create .gitignore
  fs.writeFileSync(path.join(syncDir, '.gitignore'), '.DS_Store\n', 'utf-8');

  // Initial export + push if repo is empty
  if (!fs.existsSync(path.join(syncDir, SYNC_FILE))) {
    console.log('  Performing initial export...');
    const { tables } = await exportToFile(path.join(syncDir, SYNC_FILE));
    printCounts('Exported', tables);

    try {
      await git.gitAdd(syncDir, ['.gitignore', SYNC_FILE]);
      await git.gitCommit(syncDir, 'sync: initial export');
      await git.gitPush(syncDir, true);
      console.log('  Pushed initial data.\n');
    } catch (err) {
      console.log(`  Committed locally. Push manually if needed: ${(err as Error).message}\n`);
    }
  }

  console.log(`  Sync initialized successfully!`);
  console.log(`  Remote: ${repoUrl}\n`);
}

export async function syncPush(message?: string) {
  const syncDir = getSyncDir();

  if (!git.isGitRepo(syncDir)) {
    console.error('\n  Sync not initialized. Run "im sync init" first.\n');
    process.exit(1);
  }

  // Export
  const filePath = path.join(syncDir, SYNC_FILE);
  const { tables } = await exportToFile(filePath);
  printCounts('Exported', tables);

  // Commit + push
  try {
    await git.gitAdd(syncDir, [SYNC_FILE]);
    const commitMsg = message || `sync: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`;
    await git.gitCommit(syncDir, commitMsg);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('nothing to commit') || msg.includes('no changes')) {
      console.log('  Already up to date.\n');
      return;
    }
    throw err;
  }

  try {
    const firstPush = !await git.hasCommits(syncDir).catch(() => true);
    await git.gitPush(syncDir, firstPush);
    console.log('  Pushed successfully.\n');
  } catch (err) {
    console.error(`  Push failed: ${(err as Error).message}`);
    console.log('  Data is committed locally. Try pushing manually.\n');
  }
}

export async function syncPull(opts: { backup?: boolean } = {}) {
  const syncDir = getSyncDir();

  if (!git.isGitRepo(syncDir)) {
    console.error('\n  Sync not initialized. Run "im sync init" first.\n');
    process.exit(1);
  }

  // Pull
  try {
    await git.gitPull(syncDir);
    console.log('  Pulled latest data.');
  } catch (err) {
    console.error(`  Pull failed: ${(err as Error).message}\n`);
    process.exit(1);
  }

  const filePath = path.join(syncDir, SYNC_FILE);
  if (!fs.existsSync(filePath)) {
    console.log('  No sync data found. Run "im sync push" on another machine first.\n');
    return;
  }

  // Backup
  if (opts.backup !== false) {
    const backupPath = await backupDb();
    console.log(`  Backup: ${backupPath}`);
  }

  // Import
  const { tables } = await importFromFile(filePath);
  printCounts('Imported', tables);
  console.log('  Done. Refresh the browser to see updated data.\n');
}

export async function syncStatus() {
  const syncDir = getSyncDir();

  if (!git.isGitRepo(syncDir)) {
    console.log('\n  Sync not initialized.');
    console.log('  Run "im sync init" to set up.\n');
    return;
  }

  const remoteUrl = await git.getRemoteUrl(syncDir);
  const lastCommit = await git.getLastCommitInfo(syncDir);
  const filePath = path.join(syncDir, SYNC_FILE);
  const hasData = fs.existsSync(filePath);

  console.log('\n  IM Sync Status');
  console.log(`  Remote: ${remoteUrl || 'none'}`);
  console.log(`  Last sync: ${lastCommit || 'never'}`);
  console.log(`  Data file: ${hasData ? 'exists' : 'not found'}`);
  console.log(`\n  Commands: im sync push | im sync pull\n`);
}
