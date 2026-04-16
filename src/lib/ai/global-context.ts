import { listProjects } from '../db/queries/projects';
import { getSubProjects } from '../db/queries/sub-projects';
import { getTasksByProject } from '../db/queries/tasks';
import { getBrainstorm } from '../db/queries/brainstorms';
import type { ITask, TaskStatus } from '../../types';

const ACTION_INSTRUCTIONS = `
## Actions
사용자가 요청하면 태스크 생성/수정을 제안할 수 있습니다. \`\`\`action 블록을 사용하세요.
사용자가 명시적으로 요청하지 않으면 action 블록을 넣지 마세요.

형식:
\`\`\`action
[
  {"type":"create_task","subProjectId":"<sub_id값>","projectId":"<project_id값>","title":"제목","priority":"high|medium|low"},
  {"type":"update_task","taskId":"<task_id값>","changes":{"status":"done"}}
]
\`\`\`

규칙:
- subProjectId, taskId, projectId는 아래 컨텍스트의 [sub_id:...], [task_id:...], [project_id:...] 값을 정확히 사용
- action 블록 앞에 항상 무엇을 제안하는지 설명
- 사용자가 승인해야 실행됨
`;

const MAX_BRAINSTORM = 1500;
const NOTE_LIMIT = 120;
const MAX_HISTORY_MESSAGES = 20;

function truncate(s: string | null | undefined, max: number): string {
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

const STATUS_ICON: Record<string, string> = {
  idea: 'idea', doing: 'DOING', writing: 'writing', submitted: 'submitted',
  testing: 'testing', done: 'done', problem: 'PROBLEM',
};

export function buildGlobalAdvisorPrompt(): string {
  const projects = listProjects();

  const parts: string[] = [];
  parts.push('당신은 사용자의 전체 워크스페이스를 조망하는 AI 어드바이저입니다.');
  parts.push('여러 프로젝트의 현황을 파악하고, 우선순위·방향·빠진 부분·크로스-프로젝트 이슈 등을 논의합니다.');
  parts.push('한국어로 간결하게 답하세요. 긴 설교 금지.');
  parts.push(ACTION_INSTRUCTIONS);

  parts.push('=== ALL WORKSPACES ===\n');

  let totalTasks = 0;
  let totalDone = 0;
  let totalProblem = 0;

  for (const project of projects) {
    const subs = getSubProjects(project.id);
    const allTasks = getTasksByProject(project.id);
    const brainstorm = getBrainstorm(project.id);

    totalTasks += allTasks.length;
    totalDone += allTasks.filter(t => t.status === 'done').length;
    totalProblem += allTasks.filter(t => t.status === 'problem').length;

    const counts: Record<string, number> = {};
    const todayTasks: string[] = [];
    const problemTasks: string[] = [];
    for (const t of allTasks) {
      counts[t.status] = (counts[t.status] ?? 0) + 1;
      if (t.is_today) todayTasks.push(t.title);
      if (t.status === 'problem') problemTasks.push(t.title);
    }

    const lines: string[] = [];
    lines.push(`## ${project.name} [project_id:${project.id}]`);
    if (project.description) lines.push(project.description);
    const statsStr = Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' / ');
    lines.push(`태스크 ${allTasks.length}개 (${statsStr})`);
    if (todayTasks.length) lines.push(`Today: ${todayTasks.join(', ')}`);
    if (problemTasks.length) lines.push(`문제: ${problemTasks.join(', ')}`);

    if (brainstorm?.content) {
      lines.push(`\n브레인스토밍 요약: ${truncate(brainstorm.content, MAX_BRAINSTORM)}`);
    }

    // Show active (non-done, non-archived) tasks by sub-project
    for (const sub of subs) {
      const subTasks = allTasks.filter(t => t.sub_project_id === sub.id && t.status !== 'done');
      if (!subTasks.length) continue;
      lines.push(`\n### ${sub.name} [sub_id:${sub.id}]`);
      for (const t of subTasks) {
        const note = truncate(t.description, NOTE_LIMIT);
        const flags = [t.priority === 'high' ? 'HIGH' : null, t.is_today ? 'today' : null].filter(Boolean).join(', ');
        const flagStr = flags ? ` (${flags})` : '';
        lines.push(`- [${STATUS_ICON[t.status] ?? t.status}] **${t.title}** [task_id:${t.id}]${flagStr}${note ? ' — ' + note : ''}`);
      }
    }

    parts.push(lines.join('\n'));
    parts.push('');
  }

  parts.push('---');
  parts.push(`전체: ${projects.length}개 워크스페이스, ${totalTasks}개 태스크 (완료 ${totalDone}, 문제 ${totalProblem})`);

  return parts.join('\n');
}

export function trimHistory(
  messages: { role: string; content: string }[],
): { role: string; content: string }[] {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
  return messages.slice(-MAX_HISTORY_MESSAGES);
}
