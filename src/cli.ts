#!/usr/bin/env node

import { Command } from 'commander';
import { startMcpServer } from '@/lib/mcp/server';
import { listProjects, getProject } from '@/lib/db/queries/projects';
import { getItemTree, getItems, updateItem } from '@/lib/db/queries/items';
import { getPrompt } from '@/lib/db/queries/prompts';
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
  .description('Idea Manager - AI 기반 브레인스토밍 → 구조화 → 프롬프트 생성 도구')
  .version('0.1.0');

program
  .command('mcp')
  .description('Start MCP server (stdio mode)')
  .action(async () => {
    const ctx: McpToolContext = {
      listProjects,
      getProject,
      getItemTree,
      getItems,
      getPrompt,
      updateItem: (id, data) => updateItem(id, data as Parameters<typeof updateItem>[1]),
    };

    await startMcpServer(ctx);
  });

program
  .command('start')
  .description('Start the web UI (Next.js dev server on port 3456)')
  .option('-p, --port <port>', 'Port number', '3456')
  .action(async (opts) => {
    const port = opts.port;
    console.log(`\n  IM - 아이디어 매니저`);
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

    // 서버 시작 후 브라우저 오픈
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
