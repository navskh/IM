import { listProjects } from '../db/queries/projects';
import { getSubProjects } from '../db/queries/sub-projects';
import { getTasksByProject } from '../db/queries/tasks';
import { getBrainstorm } from '../db/queries/brainstorms';
import type { ITask, TaskStatus } from '../../types';

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
  parts.push('한국어로 간결하게 답하세요. 긴 설교 금지.\n');

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
    lines.push(`## ${project.name}`);
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
      lines.push(`\n### ${sub.name}`);
      for (const t of subTasks) {
        const note = truncate(t.description, NOTE_LIMIT);
        const flags = [t.priority === 'high' ? 'HIGH' : null, t.is_today ? 'today' : null].filter(Boolean).join(', ');
        const flagStr = flags ? ` (${flags})` : '';
        lines.push(`- [${STATUS_ICON[t.status] ?? t.status}] **${t.title}**${flagStr}${note ? ' — ' + note : ''}`);
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
