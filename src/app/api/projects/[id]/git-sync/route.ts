import { NextRequest, NextResponse } from 'next/server';
import { getProject } from '@/lib/db/queries/projects';
import { execFile } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import type { IGitSyncResult } from '@/types';

function gitPull(cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile('git', ['pull'], { cwd, timeout: 15000 }, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({ stdout, stderr });
    });
  });
}

async function syncOneRepo(dirPath: string, name: string): Promise<IGitSyncResult> {
  try {
    const { stdout, stderr } = await gitPull(dirPath);
    const message = (stdout || stderr || '').trim().slice(0, 500);
    return {
      projectId: name,
      projectName: name,
      projectPath: dirPath,
      status: 'success',
      message: message || 'Already up to date.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message.slice(0, 500) : 'Unknown error';
    return {
      projectId: name,
      projectName: name,
      projectPath: dirPath,
      status: 'error',
      message,
    };
  }
}

function findGitRepos(rootPath: string): { name: string; path: string }[] {
  // If root itself is a git repo
  if (existsSync(path.join(rootPath, '.git'))) {
    return [{ name: path.basename(rootPath), path: rootPath }];
  }

  // Otherwise scan immediate subdirectories
  const repos: { name: string; path: string }[] = [];
  try {
    const entries = readdirSync(rootPath);
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const fullPath = path.join(rootPath, entry);
      try {
        if (statSync(fullPath).isDirectory() && existsSync(path.join(fullPath, '.git'))) {
          repos.push({ name: entry, path: fullPath });
        }
      } catch {
        // skip inaccessible dirs
      }
    }
  } catch {
    // skip
  }
  return repos;
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
    return NextResponse.json([{
      projectId: project.id,
      projectName: project.name,
      projectPath: '',
      status: 'no-path',
      message: 'No folder linked',
    }] satisfies IGitSyncResult[]);
  }

  const projectPath = project.project_path;

  if (!existsSync(projectPath)) {
    return NextResponse.json([{
      projectId: project.id,
      projectName: project.name,
      projectPath,
      status: 'error',
      message: 'Directory not found',
    }] satisfies IGitSyncResult[]);
  }

  const repos = findGitRepos(projectPath);

  if (repos.length === 0) {
    return NextResponse.json([{
      projectId: project.id,
      projectName: project.name,
      projectPath,
      status: 'no-git',
      message: 'No git repositories found',
    }] satisfies IGitSyncResult[]);
  }

  const results: IGitSyncResult[] = [];
  for (const repo of repos) {
    results.push(await syncOneRepo(repo.path, repo.name));
  }

  return NextResponse.json(results);
}
