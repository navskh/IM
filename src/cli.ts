#!/usr/bin/env node

import { Command } from 'commander';
import { startMcpServer } from '@/lib/mcp/server';
import { listProjects, getProject } from '@/lib/db/queries/projects';
import { getSubProjects } from '@/lib/db/queries/sub-projects';
import { getTasksByProject, updateTask } from '@/lib/db/queries/tasks';
import { getTaskPrompt } from '@/lib/db/queries/task-prompts';
import type { McpToolContext } from '@/lib/mcp/tools';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PKG_ROOT = path.resolve(__dirname, '..');

const program = new Command();

program
  .name('im')
  .description('Idea Manager v2 - Brainstorming to structured tasks with prompts')
  .version('0.2.0');

program
  .command('mcp')
  .description('Start MCP server (stdio mode)')
  .action(async () => {
    const ctx: McpToolContext = {
      listProjects,
      getProject,
      getSubProjects,
      getTasksByProject,
      getTaskPrompt,
      updateTask: (id, data) => updateTask(id, data as Parameters<typeof updateTask>[1]),
    };

    await startMcpServer(ctx);
  });

program
  .command('watch')
  .description('Watch for submitted tasks and auto-execute via Claude CLI')
  .option('--project <id>', 'Watch a specific project (default: all)')
  .option('--interval <seconds>', 'Polling interval in seconds', '10')
  .option('--timeout <minutes>', 'Per-task timeout in minutes', '10')
  .option('--dry-run', 'Show what would be executed without running')
  .action(async (opts) => {
    const { startWatcher } = await import('@/lib/watcher');
    await startWatcher({
      projectId: opts.project,
      intervalMs: parseInt(opts.interval) * 1000,
      timeoutMs: parseInt(opts.timeout) * 60000,
      dryRun: !!opts.dryRun,
    });
  });

program
  .command('start')
  .description('Start the web UI (Next.js dev server on port 3456)')
  .option('-p, --port <port>', 'Port number', '3456')
  .action(async (opts) => {
    const port = opts.port;
    console.log(`\n  IM - Idea Manager v2`);
    console.log(`  Starting on http://localhost:${port}\n`);

    const nextBin = path.join(PKG_ROOT, 'node_modules', '.bin', 'next');
    const child = spawn(nextBin, ['dev', '-p', port], {
      cwd: PKG_ROOT,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development' },
    });

    child.on('error', (err) => {
      console.error('Failed to start server:', err.message);
      process.exit(1);
    });

    setTimeout(async () => {
      try {
        const open = (await import('open')).default;
        await open(`http://localhost:${port}`);
      } catch { /* ignore */ }
    }, 3000);

    process.on('SIGINT', () => { child.kill(); process.exit(0); });
    process.on('SIGTERM', () => { child.kill(); process.exit(0); });
  });

program.parse();
