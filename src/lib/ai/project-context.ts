import { getProject } from '../db/queries/projects';
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
  {"type":"create_task","subProjectId":"<sub_id값>","title":"제목","priority":"high|medium|low","status":"idea"},
  {"type":"update_task","taskId":"<task_id값>","changes":{"status":"done"}}
]
\`\`\`

규칙:
- subProjectId, taskId는 아래 컨텍스트의 [sub_id:...], [task_id:...] 값을 정확히 사용
- action 블록 앞에 항상 무엇을 제안하는지 설명
- 사용자가 승인해야 실행됨 (자동 실행 아님)
`;

const MAX_BRAINSTORM = 4000;
const NOTE_LIMIT_ACTIVE = 500;
const NOTE_LIMIT_DEFAULT = 200;
const MAX_HISTORY_MESSAGES = 20;

function truncate(s: string | null | undefined, max: number): string {
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, max) + '…';
}

function isActive(task: ITask): boolean {
  return (['doing', 'problem', 'testing'] as TaskStatus[]).includes(task.status) || task.is_today;
}

const STATUS_ICON: Record<string, string> = {
  idea: 'idea', doing: 'DOING', writing: 'writing', submitted: 'submitted',
  testing: 'testing', done: 'done', problem: 'PROBLEM',
};

export function buildProjectAdvisorPrompt(projectId: string): string {
  const project = getProject(projectId);
  if (!project) return '';

  const brainstorm = getBrainstorm(projectId);
  const subs = getSubProjects(projectId);
  const allTasks = getTasksByProject(projectId);

  // Group tasks by sub-project
  const tasksBySub = new Map<string, ITask[]>();
  for (const t of allTasks) {
    const list = tasksBySub.get(t.sub_project_id) ?? [];
    list.push(t);
    tasksBySub.set(t.sub_project_id, list);
  }

  // Build task summary per sub-project
  const subSections: string[] = [];
  for (const sub of subs) {
    const tasks = tasksBySub.get(sub.id) ?? [];
    if (tasks.length === 0) {
      subSections.push(`### ${sub.name}\n${sub.description || '(설명 없음)'}\n태스크 없음.`);
      continue;
    }
    const lines: string[] = [];
    lines.push(`### ${sub.name} [sub_id:${sub.id}]`);
    if (sub.description) lines.push(sub.description);
    lines.push(`태스크 ${tasks.length}개:`);
    for (const t of tasks) {
      const noteLimit = isActive(t) ? NOTE_LIMIT_ACTIVE : NOTE_LIMIT_DEFAULT;
      const note = truncate(t.description, noteLimit);
      const flags = [t.priority === 'high' ? 'HIGH' : null, t.is_today ? 'today' : null].filter(Boolean).join(', ');
      const flagStr = flags ? ` (${flags})` : '';
      const noteStr = note ? ` — ${note}` : '';
      lines.push(`- [${STATUS_ICON[t.status] ?? t.status}] **${t.title}** [task_id:${t.id}]${flagStr}${noteStr}`);
    }
    subSections.push(lines.join('\n'));
  }

  // Stats
  const counts: Record<string, number> = {};
  let todayCount = 0;
  const problemTasks: string[] = [];
  for (const t of allTasks) {
    counts[t.status] = (counts[t.status] ?? 0) + 1;
    if (t.is_today) todayCount++;
    if (t.status === 'problem') problemTasks.push(t.title);
  }
  const statsLines = [
    `- 전체: ${allTasks.length}개`,
    ...Object.entries(counts).map(([k, v]) => `  - ${k}: ${v}`),
    `- Today 표시: ${todayCount}개`,
  ];
  if (problemTasks.length > 0) {
    statsLines.push(`- 문제 태스크: ${problemTasks.join(', ')}`);
  }

  // Assemble
  const parts: string[] = [];
  parts.push(`당신은 프로젝트 "${project.name}"의 어드바이저입니다.`);
  parts.push(`사용자가 프로젝트 방향, 우선순위, 빠진 부분, 다음 단계 등을 논의하면 프로젝트 전체 맥락을 바탕으로 간결하게 답합니다.`);
  parts.push(`태스크를 언급할 때는 정확한 제목을 쓰세요. 한국어로 답하세요. 긴 설교는 금지.`);
  parts.push(ACTION_INSTRUCTIONS);

  if (project.ai_context) {
    parts.push(`\nProject AI Policy:\n${project.ai_context}`);
  }

  parts.push('\n=== PROJECT CONTEXT ===');

  if (brainstorm?.content) {
    parts.push(`\n## 브레인스토밍\n${truncate(brainstorm.content, MAX_BRAINSTORM)}`);
  }

  parts.push(`\n## 프로젝트 & 태스크\n${subSections.join('\n\n')}`);
  parts.push(`\n## 통계\n${statsLines.join('\n')}`);

  return parts.join('\n');
}

export function trimConversationHistory(
  messages: { role: string; content: string }[],
): { role: string; content: string }[] {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
  return messages.slice(-MAX_HISTORY_MESSAGES);
}
