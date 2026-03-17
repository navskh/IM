#!/usr/bin/env node

import { Command } from 'commander';
import { startMcpServer } from './lib/mcp/server';
import { listProjects, getProject } from './lib/db/queries/projects';
import { getSubProjects } from './lib/db/queries/sub-projects';
import { getTasksByProject, updateTask } from './lib/db/queries/tasks';
import { getTaskPrompt } from './lib/db/queries/task-prompts';
import type { McpToolContext } from './lib/mcp/tools';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PKG_ROOT = path.resolve(__dirname, '..');

async function openAsApp(url: string) {
  const { exec: execCb } = await import('child_process');
  const platform = process.platform;

  // Shell commands for --app mode per platform
  const commands: string[] =
    platform === 'darwin'
      ? [
          `open -a "Google Chrome" --args --app=${url}`,
          `open -a "Microsoft Edge" --args --app=${url}`,
          `open -a "Chromium" --args --app=${url}`,
        ]
      : platform === 'win32'
        ? [
            `start "" chrome --app=${url}`,
            `start "" msedge --app=${url}`,
          ]
        : [
            `google-chrome --app=${url}`,
            `chromium-browser --app=${url}`,
            `microsoft-edge --app=${url}`,
          ];

  for (const cmd of commands) {
    try {
      await new Promise<void>((resolve, reject) => {
        execCb(cmd, (err) => { if (err) reject(err); else resolve(); });
      });
      return; // success
    } catch {
      continue; // try next browser
    }
  }

  // Fallback: open normally
  const open = (await import('open')).default;
  await open(url);
}

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
    const { startWatcher } = await import('./lib/watcher');
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

    // Resolve next CLI directly — avoids .bin symlink issues on Windows
    // and npm global install hoisting issues
    let nextCli: string;
    try {
      nextCli = require.resolve('next/dist/bin/next', { paths: [PKG_ROOT] });
    } catch {
      // Fallback: try to find next package manually
      nextCli = path.join(PKG_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
    }

    const child = spawn(process.execPath, [nextCli, 'dev', '-p', port], {
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
        await openAsApp(`http://localhost:${port}`);
      } catch { /* ignore */ }
    }, 3000);

    process.on('SIGINT', () => { child.kill(); process.exit(0); });
    process.on('SIGTERM', () => { child.kill(); process.exit(0); });
  });

const syncCmd = program
  .command('sync')
  .description('Sync data via GitHub repository')
  .action(async () => {
    const { syncStatus } = await import('./lib/sync');
    await syncStatus();
  });

syncCmd
  .command('init')
  .description('Initialize sync with a GitHub repository')
  .action(async () => {
    const { syncInit } = await import('./lib/sync');
    await syncInit();
  });

syncCmd
  .command('push')
  .description('Export data and push to GitHub')
  .option('-m, --message <msg>', 'Custom commit message')
  .action(async (opts) => {
    const { syncPush } = await import('./lib/sync');
    await syncPush(opts.message);
  });

syncCmd
  .command('pull')
  .description('Pull from GitHub and import data')
  .option('--no-backup', 'Skip database backup before import')
  .action(async (opts) => {
    const { syncPull } = await import('./lib/sync');
    await syncPull({ backup: opts.backup });
  });

program.parse();
