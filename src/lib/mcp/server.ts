import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getNextTask, getProjectContext, formatItemForMcp, formatTreeForMcp } from '@/lib/mcp/tools';
import type { McpToolContext } from '@/lib/mcp/tools';

export async function startMcpServer(ctx: McpToolContext) {
  const server = new McpServer({
    name: 'idea-manager',
    version: '1.0.0',
  });

  // Tool 1: list-projects
  server.tool(
    'list-projects',
    'IM 프로젝트 목록 조회',
    {},
    async () => {
      const projects = ctx.listProjects();
      const text = projects.length === 0
        ? '프로젝트가 없습니다.'
        : projects.map(p => `[${p.id}] ${p.name} - ${p.description}`).join('\n');
      return { content: [{ type: 'text', text }] };
    }
  );

  // Tool 2: get-project-context
  server.tool(
    'get-project-context',
    '프로젝트 전체 구조와 상태 조회',
    { projectId: z.string().describe('프로젝트 ID') },
    async ({ projectId }) => {
      const result = getProjectContext(ctx, projectId);
      if (!result.project) {
        return { content: [{ type: 'text', text: '프로젝트를 찾을 수 없습니다.' }] };
      }

      const lines = [
        `프로젝트: ${result.project.name}`,
        `설명: ${result.project.description}`,
        '',
        `전체: ${result.stats.total} | 대기: ${result.stats.pending} | 진행중: ${result.stats.inProgress} | 완료: ${result.stats.done} | 해제됨: ${result.stats.unlocked}`,
        '',
        '--- 구조 ---',
        formatTreeForMcp(result.tree),
      ];

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  // Tool 3: get-next-task
  server.tool(
    'get-next-task',
    '다음 실행 가능한 작업과 프롬프트 조회 (해제 + 대기 상태)',
    { projectId: z.string().describe('프로젝트 ID') },
    async ({ projectId }) => {
      const result = getNextTask(ctx, projectId);
      if (!result) {
        return { content: [{ type: 'text', text: '실행 가능한 작업이 없습니다. 항목을 해제(unlock)하세요.' }] };
      }

      const text = formatItemForMcp(result.item, result.prompt);
      return { content: [{ type: 'text', text }] };
    }
  );

  // Tool 4: get-prompt
  server.tool(
    'get-prompt',
    '특정 항목의 프롬프트 조회',
    { itemId: z.string().describe('항목 ID') },
    async ({ itemId }) => {
      const prompt = ctx.getPrompt(itemId);
      if (!prompt) {
        return { content: [{ type: 'text', text: '이 항목에 프롬프트가 없습니다. 웹 UI에서 먼저 생성하세요.' }] };
      }
      return { content: [{ type: 'text', text: prompt.content }] };
    }
  );

  // Tool 5: update-status
  server.tool(
    'update-status',
    '작업 상태 변경 (pending, in_progress, done)',
    {
      itemId: z.string().describe('항목 ID'),
      status: z.enum(['pending', 'in_progress', 'done']).describe('새 상태'),
    },
    async ({ itemId, status }) => {
      const updated = ctx.updateItem(itemId, { status });
      if (!updated) {
        return { content: [{ type: 'text', text: '항목을 찾을 수 없습니다.' }] };
      }
      return { content: [{ type: 'text', text: `${updated.title}: 상태가 '${status}'로 변경되었습니다.` }] };
    }
  );

  // Tool 6: report-completion
  server.tool(
    'report-completion',
    '작업 완료 보고 (상태를 done으로 변경 + 자동 잠금)',
    { itemId: z.string().describe('항목 ID') },
    async ({ itemId }) => {
      const updated = ctx.updateItem(itemId, { status: 'done', is_locked: true });
      if (!updated) {
        return { content: [{ type: 'text', text: '항목을 찾을 수 없습니다.' }] };
      }
      return { content: [{ type: 'text', text: `✅ ${updated.title}: 완료 처리되었습니다. (자동 잠금)` }] };
    }
  );

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('IM MCP server running on stdio');
}
