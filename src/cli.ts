#!/usr/bin/env node

// Force UTF-8 output on Windows so Korean strings don't garble in cp949 terminals.
if (process.platform === 'win32') {
  try {
    process.stdout.setDefaultEncoding?.('utf8');
    process.stderr.setDefaultEncoding?.('utf8');
  } catch { /* non-critical */ }
}

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
import { maybeAutoUpdate, respawnSelf } from './lib/auto-update';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
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
          { bin: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: [`--app=${url}`] },
          { bin: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', args: [`--app=${url}`] },
          { bin: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', args: [`--app=${url}`] },
          { bin: 'chrome', args: [`--app=${url}`] },
          { bin: 'msedge', args: [`--app=${url}`] },
        ]
        : [
          { bin: 'google-chrome', args: [`--app=${url}`] },
          { bin: 'chromium-browser', args: [`--app=${url}`] },
          { bin: 'microsoft-edge', args: [`--app=${url}`] },
        ];

  for (const browser of browsers) {
    // Skip absolute paths that don't exist (macOS .app, Windows Program Files)
    const isAbsolute = path.isAbsolute(browser.bin);
    if (isAbsolute && !fs.existsSync(browser.bin)) continue;

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

function readPkgVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch { return '0.0.0'; }
}

program
  .name('im')
  .description('Idea Manager - Brainstorming to structured tasks with prompts')
  .version(readPkgVersion());

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

    // Auto-update on boot — fetches npm latest, installs if newer, respawns.
    // Only runs for `im start`; `im mcp` / `im watch` stay untouched because
    // they may be long-running integrations we shouldn't disrupt.
    const upd = await maybeAutoUpdate(PKG_ROOT);
    if (upd.upgraded) {
      respawnSelf();
      return;
    }

    // Use pre-built standalone bundle — self-contained, no absolute paths,
    // works from any install location on any OS.
    const standaloneServer = path.join(PKG_ROOT, '.next', 'standalone', 'server.js');
    if (!fs.existsSync(standaloneServer)) {
      console.error('\n  ⚠ Pre-built standalone 번들을 찾을 수 없습니다.');
      console.error(`    재설치: npm install -g idea-manager@latest\n`);
      process.exit(1);
    }

    // The published tarball strips .next/standalone/node_modules to dodge a
    // 502 from npm registry on bundles with native binaries (sharp). We wire
    // installed deps in here on first run — npm hoisting makes the directory
    // location unpredictable, so resolve via a known dep instead of guessing.
    const standaloneNm = path.join(PKG_ROOT, '.next', 'standalone', 'node_modules');
    if (!fs.existsSync(standaloneNm)) {
      let realNm: string | null = null;
      try {
        const nextPkg = require.resolve('next/package.json', { paths: [PKG_ROOT] });
        // <real_node_modules>/next/package.json → <real_node_modules>
        realNm = path.dirname(path.dirname(nextPkg));
      } catch {
        console.error('\n  ⚠ Dependencies not found. Run: npm install -g idea-manager@latest\n');
        process.exit(1);
      }
      try {
        fs.symlinkSync(realNm, standaloneNm, process.platform === 'win32' ? 'junction' : 'dir');
      } catch {
        fs.cpSync(realNm, standaloneNm, { recursive: true });
      }
    }

    console.log(`\n  IM - Idea Manager`);
    console.log(`  Starting on http://localhost:${port}\n`);

    // Standalone server uses PORT env + resolves files relative to itself.
    const child = spawn(process.execPath, [standaloneServer], {
      cwd: path.dirname(standaloneServer),
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        HOSTNAME: '127.0.0.1',
      },
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
