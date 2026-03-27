#!/usr/bin/env node

import { Command } from 'commander';
import { ensureDb } from './lib/db';
import { startMcpServer } from './lib/mcp/server';
import { listProjects, getProject } from './lib/db/queries/projects';
import { getSubProjects } from './lib/db/queries/sub-projects';
import { getTasksByProject, updateTask } from './lib/db/queries/tasks';
import { getTaskPrompt } from './lib/db/queries/task-prompts';
import type { McpToolContext } from './lib/mcp/tools';
import { startWatcher } from './lib/watcher';
import { syncInit, syncPush, syncPull, syncStatus } from './lib/sync/index';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve PKG_ROOT robustly across macOS/Windows and tsx/cjs context
let PKG_ROOT: string;
try {
  const thisFile = fileURLToPath(import.meta.url);
  PKG_ROOT = path.resolve(path.dirname(thisFile), '..');
} catch {
  // Fallback for CJS context (tsx/cjs on some Windows setups)
  PKG_ROOT = path.resolve(__dirname, '..');
}

async function openAsApp(url: string) {
  const { spawn: spawnChild } = await import('child_process');
  const fs = await import('fs');
  const platform = process.platform;

  // Direct browser binary paths — avoids macOS `open -a --args` being ignored
  // when browser is already running
  const browsers: { bin: string; args: string[] }[] =
    platform === 'darwin'
      ? [
          { bin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: [`--app=${url}`] },
          { bin: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', args: [`--app=${url}`] },
          { bin: '/Applications/Chromium.app/Contents/MacOS/Chromium', args: [`--app=${url}`] },
        ]
      : platform === 'win32'
        ? [
          { bin: 'chrome', args: [`--app=${url}`] },
          { bin: 'msedge', args: [`--app=${url}`] },
        ]
        : [
          { bin: 'google-chrome', args: [`--app=${url}`] },
          { bin: 'chromium-browser', args: [`--app=${url}`] },
          { bin: 'microsoft-edge', args: [`--app=${url}`] },
        ];

  for (const browser of browsers) {
    if (platform === 'darwin' && !fs.existsSync(browser.bin)) continue;

    try {
      const child = spawnChild(browser.bin, browser.args, {
        detached: true,
        stdio: 'ignore',
        shell: platform === 'win32',
      });
      child.unref();
      return; // success
    } catch {
      continue;
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
    await ensureDb();
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
    await startWatcher({
      projectId: opts.project,
      intervalMs: parseInt(opts.interval) * 1000,
      timeoutMs: parseInt(opts.timeout) * 60000,
      dryRun: !!opts.dryRun,
    });
  });

program
  .command('start')
  .description('Start the web UI on port 3456')
  .option('-p, --port <port>', 'Port number', '3456')
  .action(async (opts) => {
    const port = opts.port;
    const fs = await import('fs');

    // Resolve next CLI
    let nextCli: string;
    try {
      nextCli = require.resolve('next/dist/bin/next', { paths: [PKG_ROOT] });
    } catch {
      nextCli = path.join(PKG_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
    }

    // Build if not already built
    const buildDir = path.join(PKG_ROOT, '.next');
    if (!fs.existsSync(buildDir)) {
      console.log('\n  IM - First run: building... (this may take a minute)\n');
      const buildResult = spawn(process.execPath, [nextCli, 'build'], {
        cwd: PKG_ROOT,
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'production' },
      });
      await new Promise<void>((resolve, reject) => {
        buildResult.on('exit', (code) => {
          if (code !== 0) reject(new Error(`Build failed with code ${code}`));
          else resolve();
        });
        buildResult.on('error', reject);
      });
    }

    console.log(`\n  IM - Idea Manager`);
    console.log(`  Starting on http://localhost:${port}\n`);

    // Run production server (next start)
    const child = spawn(process.execPath, [nextCli, 'start', '-p', port], {
      cwd: PKG_ROOT,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' },
    });

    child.on('error', (err) => {
      console.error('Failed to start server:', err.message);
      process.exit(1);
    });

    // Wait for server to be ready, then open browser
    const waitAndOpen = async () => {
      const url = `http://localhost:${port}`;
      for (let i = 0; i < 30; i++) {
        try {
          await new Promise<void>((resolve, reject) => {
            const http = require('http');
            const req = http.get(url, (res: { statusCode: number }) => {
              if (res.statusCode === 200) resolve();
              else reject();
            });
            req.on('error', reject);
            req.setTimeout(1000, () => { req.destroy(); reject(); });
          });
          // Server is ready
          await openAsApp(url);
          return;
        } catch {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    };
    waitAndOpen().catch(() => {});

    process.on('SIGINT', () => { child.kill(); process.exit(0); });
    process.on('SIGTERM', () => { child.kill(); process.exit(0); });
  });

const syncCmd = program
  .command('sync')
  .description('Sync data via GitHub repository')
  .action(async () => {
    await syncStatus();
  });

syncCmd
  .command('init')
  .description('Initialize sync with a GitHub repository')
  .action(async () => {
    await syncInit();
  });

syncCmd
  .command('push')
  .description('Export data and push to GitHub')
  .option('-m, --message <msg>', 'Custom commit message')
  .action(async (opts) => {
    await syncPush(opts.message);
  });

syncCmd
  .command('pull')
  .description('Pull from GitHub and import data')
  .option('--no-backup', 'Skip database backup before import')
  .action(async (opts) => {
    await syncPull({ backup: opts.backup });
  });

program.parse();
