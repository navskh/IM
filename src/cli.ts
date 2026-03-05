#!/usr/bin/env node

import { Command } from 'commander';
import { startMcpServer } from '@/lib/mcp/server';
import { listProjects, getProject } from '@/lib/db/queries/projects';
import { getItemTree, getItems, updateItem } from '@/lib/db/queries/items';
import { getPrompt } from '@/lib/db/queries/prompts';
import type { McpToolContext } from '@/lib/mcp/tools';

const program = new Command();

program
  .name('im')
  .description('Idea Manager CLI')
  .version('1.0.0');

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
  .description('Start the web UI')
  .action(async () => {
    const open = (await import('open')).default;
    await open('http://localhost:3456');
  });

program.parse();
