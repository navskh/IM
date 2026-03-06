'use client';

import { useState } from 'react';
import type { ITask, ISubProjectWithStats, TaskStatus } from '@/types';
import { statusIcon } from './StatusFlow';

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-destructive',
  medium: 'bg-warning',
  low: 'bg-muted-foreground',
};

export default function ProjectTree({
  subProjects,
  tasks,
  selectedSubId,
  selectedTaskId,
  onSelectSub,
  onSelectTask,
  onCreateSub,
  onDeleteSub,
  onCreateTask,
  onStatusChange,
  onTodayToggle,
}: {
  subProjects: ISubProjectWithStats[];
  tasks: ITask[];
  selectedSubId: string | null;
  selectedTaskId: string | null;
  onSelectSub: (subId: string) => void;
  onSelectTask: (taskId: string) => void;
  onCreateSub: () => void;
  onDeleteSub: (subId: string) => void;
  onCreateTask: (title: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onTodayToggle: (taskId: string, isToday: boolean) => void;
}) {
  const [collapsedSubs, setCollapsedSubs] = useState<Set<string>>(new Set());
  const [addingTaskFor, setAddingTaskFor] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const toggleCollapse = (subId: string) => {
    setCollapsedSubs(prev => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId);
      else next.add(subId);
      return next;
    });
  };

  const handleAddTask = (subId: string) => {
    const title = newTaskTitle.trim();
    if (!title) return;
    onSelectSub(subId);
    onCreateTask(title);
    setNewTaskTitle('');
    setAddingTaskFor(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Projects</h2>
        <button
          onClick={onCreateSub}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          title="Add sub-project (N)"
        >
          + <span className="text-muted-foreground/50">N</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {subProjects.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-xs">
            Create a sub-project to get started
          </div>
        )}

        {subProjects.map((sp) => {
          const isSelected = selectedSubId === sp.id;
          const isCollapsed = collapsedSubs.has(sp.id);
          const subTasks = isSelected ? tasks : [];

          return (
            <div key={sp.id} className="mb-0.5">
              {/* Sub-project node */}
              <div
                onClick={() => {
                  onSelectSub(sp.id);
                  if (isCollapsed) toggleCollapse(sp.id);
                }}
                className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer transition-colors group text-sm ${
                  isSelected
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); toggleCollapse(sp.id); }}
                  className="w-4 h-4 flex items-center justify-center text-xs text-muted-foreground flex-shrink-0"
                >
                  {isCollapsed ? '\u25B6' : '\u25BC'}
                </button>
                <span className={`flex-1 truncate font-medium ${isSelected ? 'text-primary' : ''}`}>
                  {sp.name}
                </span>
                <div className="flex items-center gap-1.5">
                  {sp.task_count > 0 && (
                    <span className="text-xs text-muted-foreground tabular-nums">{sp.task_count}</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteSub(sp.id); }}
                    className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                  >
                    x
                  </button>
                </div>
              </div>

              {/* Tasks (children) */}
              {!isCollapsed && isSelected && (
                <div className="ml-3 border-l border-border/50">
                  {subTasks.length === 0 && !addingTaskFor && (
                    <div className="text-xs text-muted-foreground py-2 pl-4">
                      No tasks
                    </div>
                  )}
                  {subTasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => onSelectTask(task.id)}
                      className={`flex items-center gap-1.5 pl-4 pr-2 py-1.5 cursor-pointer transition-colors text-sm border-l-2 ${
                        selectedTaskId === task.id
                          ? 'bg-card-hover border-l-primary'
                          : 'border-l-transparent hover:bg-card-hover/50'
                      }`}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextStatus = getNextStatus(task.status);
                          onStatusChange(task.id, nextStatus);
                        }}
                        className="flex-shrink-0 text-sm"
                        title={`Status: ${task.status}`}
                      >
                        {statusIcon(task.status)}
                      </button>
                      <span className={`tree-priority-dot ${PRIORITY_COLORS[task.priority]}`} />
                      <span className={`flex-1 truncate ${task.status === 'done' ? 'text-muted-foreground line-through' : ''}`}>
                        {task.title}
                      </span>
                      {task.is_today && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onTodayToggle(task.id, false); }}
                          className="text-xs flex-shrink-0 text-primary" title="Remove from today"
                        >
                          *
                        </button>
                      )}
                    </div>
                  ))}

                  {/* Add task input */}
                  {addingTaskFor === sp.id ? (
                    <div className="pl-4 pr-2 py-1">
                      <input
                        type="text"
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddTask(sp.id);
                          if (e.key === 'Escape') { setNewTaskTitle(''); setAddingTaskFor(null); }
                        }}
                        placeholder="Task title..."
                        className="w-full bg-input border border-border rounded px-2 py-1 text-sm
                                   focus:border-primary focus:outline-none text-foreground"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <button
                      data-add-task
                      onClick={() => { onSelectSub(sp.id); setAddingTaskFor(sp.id); }}
                      className="pl-4 pr-2 py-1 text-xs text-muted-foreground hover:text-foreground
                                 transition-colors text-left w-full"
                    >
                      + Add task <span className="text-muted-foreground/50 ml-1">T</span>
                    </button>
                  )}
                </div>
              )}

              {/* Show task previews for non-selected sub-projects */}
              {!isCollapsed && !isSelected && sp.preview_tasks && sp.preview_tasks.length > 0 && (
                <div className="ml-3 border-l border-border/50">
                  {sp.preview_tasks.map((pt, i) => (
                    <div
                      key={i}
                      onClick={() => onSelectSub(sp.id)}
                      className="flex items-center gap-1.5 pl-4 pr-2 py-1 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span className="flex-shrink-0">{statusIcon(pt.status)}</span>
                      <span className="truncate">{pt.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getNextStatus(current: TaskStatus): TaskStatus {
  const flow: TaskStatus[] = ['idea', 'writing', 'submitted', 'testing', 'done'];
  const idx = flow.indexOf(current);
  if (idx === -1) return 'idea';
  return flow[(idx + 1) % flow.length];
}
