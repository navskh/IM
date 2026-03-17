import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

function quoteArg(arg: string): string {
  // Quote args with spaces for shell mode
  if (!arg.includes(' ') && !arg.includes('"')) return arg;
  if (process.platform === 'win32') {
    // cmd.exe uses "" to escape quotes
    return `"${arg.replace(/"/g, '""')}"`;
  }
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function exec(cmd: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const quotedArgs = args.map(quoteArg);
    execFile(cmd, quotedArgs, { cwd, shell: true, timeout: 60000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

export async function isGitInstalled(): Promise<boolean> {
  try { await exec('git', ['--version']); return true; } catch { return false; }
}

export async function isGhInstalled(): Promise<boolean> {
  try { await exec('gh', ['--version']); return true; } catch { return false; }
}

export async function isGhAuthenticated(): Promise<boolean> {
  try { await exec('gh', ['auth', 'status']); return true; } catch { return false; }
}

export function isGitRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, '.git'));
}

export async function ghCreateRepo(name: string): Promise<string> {
  // Create private repo and get URL
  const result = await exec('gh', ['repo', 'create', name, '--private', '--confirm']);
  // Extract repo URL from output
  const urlMatch = result.match(/https:\/\/github\.com\/\S+/);
  if (urlMatch) return urlMatch[0];
  // Fallback: query the repo URL
  const url = await exec('gh', ['repo', 'view', name, '--json', 'url', '-q', '.url']);
  return url;
}

export async function gitClone(url: string, targetDir: string): Promise<void> {
  await exec('git', ['clone', url, targetDir]);
}

export async function gitInit(cwd: string): Promise<void> {
  await exec('git', ['init'], cwd);
  // Set default branch to main
  await exec('git', ['branch', '-M', 'main'], cwd);
}

export async function gitAddRemote(cwd: string, url: string): Promise<void> {
  await exec('git', ['remote', 'add', 'origin', url], cwd);
}

export async function gitAdd(cwd: string, files: string[]): Promise<void> {
  await exec('git', ['add', ...files], cwd);
}

export async function gitCommit(cwd: string, message: string): Promise<void> {
  await exec('git', ['commit', '-m', message], cwd);
}

export async function gitPush(cwd: string, setUpstream = false): Promise<void> {
  if (setUpstream) {
    // Ensure branch is named main, then push
    try { await exec('git', ['branch', '-M', 'main'], cwd); } catch { /* already main */ }
    await exec('git', ['push', '-u', 'origin', 'main'], cwd);
  } else {
    await exec('git', ['push'], cwd);
  }
}

export async function gitPull(cwd: string): Promise<void> {
  await exec('git', ['pull'], cwd);
}

export async function hasRemote(cwd: string): Promise<boolean> {
  try {
    const result = await exec('git', ['remote'], cwd);
    return result.includes('origin');
  } catch { return false; }
}

export async function hasCommits(cwd: string): Promise<boolean> {
  try {
    await exec('git', ['rev-parse', 'HEAD'], cwd);
    return true;
  } catch { return false; }
}

export async function getRemoteUrl(cwd: string): Promise<string | null> {
  try {
    return await exec('git', ['remote', 'get-url', 'origin'], cwd);
  } catch { return null; }
}

export async function getLastCommitInfo(cwd: string): Promise<string | null> {
  try {
    return await exec('git', ['log', '-1', '--format=%ci %s'], cwd);
  } catch { return null; }
}
