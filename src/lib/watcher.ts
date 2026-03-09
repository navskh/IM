import fs from 'fs';
import { runClaude } from './ai/client';
import { listProjects, getProject } from './db/queries/projects';
import { getSubProject } from './db/queries/sub-projects';
import { getTasksByProject, getTask, updateTask } from './db/queries/tasks';
import { getTaskPrompt } from './db/queries/task-prompts';
import { addTaskConversation } from './db/queries/task-conversations';
import type { ITask, IProject } from '@/types';

export interface WatcherOptions {
  projectId?: string;
  intervalMs: number;
  timeoutMs: number;
  dryRun: boolean;
}

function timestamp(): string {
  return new Date().toLocaleTimeString('ko-KR', { hour12: false });
}

function log(msg: string) {
  console.log(`[IM Watch] ${msg}`);
}

function logTask(msg: string) {
  console.log(`  ${msg}`);
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

function resolveCwd(task: ITask, project: IProject): string | null {
  // 1. sub_project.folder_path
  const subProject = getSubProject(task.sub_project_id);
  if (subProject?.folder_path && fs.existsSync(subProject.folder_path)) {
    return subProject.folder_path;
  }
  // 2. project.project_path
  if (project.project_path && fs.existsSync(project.project_path)) {
    return project.project_path;
  }
  return null;
}

async function executeTask(task: ITask, project: IProject, options: WatcherOptions): Promise<void> {
  const cwd = resolveCwd(task, project);
  if (!cwd) {
    logTask(`⚠ Skip "${task.title}" — no folder_path or project_path set`);
    return;
  }

  const prompt = getTaskPrompt(task.id);
  if (!prompt?.content?.trim()) {
    logTask(`⚠ Skip "${task.title}" — no prompt content`);
    return;
  }

  // Re-check status (another watcher might have grabbed it)
  const fresh = getTask(task.id);
  if (!fresh || fresh.status !== 'submitted') {
    logTask(`⚠ Skip "${task.title}" — status already changed`);
    return;
  }

  const subProject = getSubProject(task.sub_project_id);
  const subName = subProject?.name || 'unknown';

  console.log(`[${timestamp()}] ▶ "${task.title}" (sub: ${subName}, cwd: ${cwd})`);

  if (options.dryRun) {
    logTask(`[DRY RUN] Would execute prompt (${prompt.content.length} chars)`);
    return;
  }

  // Transition: submitted → testing
  updateTask(task.id, { status: 'testing' });
  logTask(`submitted → testing`);
  addTaskConversation(task.id, 'user', `[watch] Execution started`);

  const startTime = Date.now();

  // Build prompt with AI policy context
  let fullPrompt = prompt.content;
  if (project.ai_context) {
    fullPrompt = `Project AI Policy:\n${project.ai_context}\n\n---\n\n${fullPrompt}`;
  }

  try {
    const result = await runClaude(fullPrompt, undefined, undefined, {
      cwd,
      timeoutMs: options.timeoutMs,
    });

    const duration = Date.now() - startTime;
    updateTask(task.id, { status: 'done' });
    addTaskConversation(task.id, 'assistant', result || '(no output)');
    console.log(`[${timestamp()}]   ✓ Done (${formatDuration(duration)})`);
  } catch (err) {
    const duration = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    updateTask(task.id, { status: 'problem' });
    addTaskConversation(task.id, 'assistant', `[error] ${errorMsg}`);
    console.log(`[${timestamp()}]   ✗ Failed (${formatDuration(duration)}): ${errorMsg}`);
  }
}

export async function startWatcher(options: WatcherOptions): Promise<void> {
  // Validate project if specified
  if (options.projectId) {
    const project = getProject(options.projectId);
    if (!project) {
      console.error(`Error: Project "${options.projectId}" not found.`);
      process.exit(1);
    }
    log(`Watching project: "${project.name}" (${project.id})`);
  } else {
    const projects = listProjects();
    log(`Watching all projects (${projects.length})`);
  }

  log(`Polling every ${options.intervalMs / 1000}s | Timeout: ${options.timeoutMs / 60000}m${options.dryRun ? ' | DRY RUN' : ''}`);
  log('─'.repeat(50));
  log('Press Ctrl+C to stop\n');

  let isProcessing = false;
  let shuttingDown = false;

  const poll = async () => {
    if (isProcessing || shuttingDown) return;
    isProcessing = true;

    try {
      // Collect submitted tasks
      const projectIds = options.projectId
        ? [options.projectId]
        : listProjects().map(p => p.id);

      const submittedTasks: { task: ITask; project: IProject }[] = [];

      for (const pid of projectIds) {
        const project = getProject(pid);
        if (!project) continue;
        const tasks = getTasksByProject(pid).filter(t => t.status === 'submitted');
        for (const task of tasks) {
          submittedTasks.push({ task, project });
        }
      }

      if (submittedTasks.length > 0) {
        console.log(`[${timestamp()}] Found ${submittedTasks.length} submitted task(s)`);
        for (const { task, project } of submittedTasks) {
          if (shuttingDown) break;
          await executeTask(task, project, options);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${timestamp()}] Poll error: ${msg}`);
    } finally {
      isProcessing = false;
    }
  };

  // Graceful shutdown
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[IM Watch] Shutting down...${isProcessing ? ' (waiting for current task)' : ''}`);
    if (!isProcessing) process.exit(0);
    // If processing, the poll loop will exit after the current task
    const checkDone = setInterval(() => {
      if (!isProcessing) {
        clearInterval(checkDone);
        process.exit(0);
      }
    }, 500);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Initial poll + recurring
  await poll();
  setInterval(poll, options.intervalMs);
}
