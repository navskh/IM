'use client';

import type { ISubProjectWithStats, TaskStatus } from '@/types';

const STATUS_ICONS: Record<TaskStatus, string> = {
  idea: '\u{1F4A1}',
  writing: '\u{270F}\u{FE0F}',
  submitted: '\u{1F680}',
  testing: '\u{1F9EA}',
  done: '\u{2705}',
  problem: '\u{1F534}',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function SubProjectCard({
  subProject,
  projectName,
  onClick,
}: {
  subProject: ISubProjectWithStats;
  projectName: string;
  onClick: () => void;
}) {
  const { active_count, pending_count, done_count, problem_count, task_count, preview_tasks, last_activity } = subProject;

  return (
    <div
      onClick={onClick}
      className="p-4 bg-card hover:bg-card-hover border border-border rounded-xl
                 cursor-pointer transition-all group hover:border-muted-foreground/30
                 hover:shadow-md hover:shadow-black/20"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-sm font-semibold group-hover:text-primary transition-colors truncate flex-1">
          {subProject.name}
        </h3>
        <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">{projectName}</span>
      </div>

      {preview_tasks.length > 0 && (
        <div className="space-y-1 mb-3">
          {preview_tasks.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="flex-shrink-0">{STATUS_ICONS[t.status]}</span>
              <span className={`truncate ${t.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                {t.title}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {active_count > 0 && <span className="text-primary">active {active_count}</span>}
          {pending_count > 0 && <span>pending {pending_count}</span>}
          {done_count > 0 && <span className="text-success">done {done_count}</span>}
          {problem_count > 0 && <span className="text-destructive">problem {problem_count}</span>}
          {task_count === 0 && <span>no tasks</span>}
        </div>
        {last_activity && <span>{timeAgo(last_activity)}</span>}
      </div>
    </div>
  );
}
