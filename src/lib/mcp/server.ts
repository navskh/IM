import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getNextTask, getProjectContext, formatTaskForMcp, formatProjectForMcp } from './tools';
import type { McpToolContext } from './tools';

export async function startMcpServer(ctx: McpToolContext) {
  const server = new McpServer({
    name: 'idea-manager',
    version: '2.0.0',
  });

  // Tool 1: list-projects
  server.tool(
    'list-projects',
    'List all IM projects',
    {},
    async () => {
      const projects = ctx.listProjects();
      const text = projects.length === 0
        ? 'No projects.'
        : projects.map(p => `[${p.id}] ${p.name} - ${p.description}`).join('\n');
      return { content: [{ type: 'text', text }] };
    }
  );

  // Tool 2: get-project-context
  server.tool(
    'get-project-context',
    'Get project structure: sub-projects, tasks, and stats',
    { projectId: z.string().describe('Project ID') },
    async ({ projectId }) => {
      const result = getProjectContext(ctx, projectId);
      if (!result.project) {
        return { content: [{ type: 'text', text: 'Project not found.' }] };
      }

      const lines = [
        `Project: ${result.project.name}`,
        `Description: ${result.project.description}`,
        '',
        `Total: ${result.stats.total} | Submitted: ${result.stats.submitted} | Testing: ${result.stats.testing} | Done: ${result.stats.done} | Problem: ${result.stats.problem}`,
        '',
        '--- Structure ---',
        formatProjectForMcp(result.subProjects, result.tasks),
      ];

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  // Tool 3: get-next-task
  server.tool(
    'get-next-task',
    'Get next submitted task with its prompt',
    { projectId: z.string().describe('Project ID') },
    async ({ projectId }) => {
      const result = getNextTask(ctx, projectId);
      if (!result) {
        return { content: [{ type: 'text', text: 'No submitted tasks available.' }] };
      }

      const text = formatTaskForMcp(result.task, result.prompt);
      return { content: [{ type: 'text', text }] };
    }
  );

  // Tool 4: get-task-prompt
  server.tool(
    'get-task-prompt',
    'Get prompt for a specific task',
    { taskId: z.string().describe('Task ID') },
    async ({ taskId }) => {
      const prompt = ctx.getTaskPrompt(taskId);
      if (!prompt?.content) {
        return { content: [{ type: 'text', text: 'No prompt for this task.' }] };
      }
      return { content: [{ type: 'text', text: prompt.content }] };
    }
  );

  // Tool 5: update-status
  server.tool(
    'update-status',
    'Update task status (idea, writing, submitted, testing, done, problem)',
    {
      taskId: z.string().describe('Task ID'),
      status: z.enum(['idea', 'writing', 'submitted', 'testing', 'done', 'problem']).describe('New status'),
    },
    async ({ taskId, status }) => {
      const updated = ctx.updateTask(taskId, { status });
      if (!updated) {
        return { content: [{ type: 'text', text: 'Task not found.' }] };
      }
      return { content: [{ type: 'text', text: `${updated.title}: status changed to '${status}'.` }] };
    }
  );

  // Tool 6: report-completion
  server.tool(
    'report-completion',
    'Report task completion (sets status to done)',
    { taskId: z.string().describe('Task ID') },
    async ({ taskId }) => {
      const updated = ctx.updateTask(taskId, { status: 'done' });
      if (!updated) {
        return { content: [{ type: 'text', text: 'Task not found.' }] };
      }
      return { content: [{ type: 'text', text: `${updated.title}: completed.` }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('IM MCP server v2 running on stdio');
}
