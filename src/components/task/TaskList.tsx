'use client';

import { useState } from 'react';
import type { ITask, TaskStatus } from '@/types';
import { statusIcon } from './StatusFlow';

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-destructive',
  medium: 'bg-warning',
  low: 'bg-muted-foreground',
};

export default function TaskList({
  tasks,
  selectedTaskId,
  onSelect,
  onCreate,
  onStatusChange,
  onTodayToggle,
}: {
  tasks: ITask[];
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
  onCreate: (title: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onTodayToggle: (taskId: string, isToday: boolean) => void;
}) {
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = () => {
    const title = newTitle.trim();
    if (!title) return;
    onCreate(title);
    setNewTitle('');
    setAdding(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 && !adding && (
          <div className="text-center py-8 text-muted-foreground text-xs">
            No tasks yet
          </div>
        )}
        {tasks.map((task) => (
          <div
            key={task.id}
            onClick={() => onSelect(task.id)}
            className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors text-sm border-l-2 ${
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
                className="text-xs flex-shrink-0" title="Remove from today"
              >
                *
              </button>
            )}
          </div>
        ))}
      </div>

      {adding ? (
        <div className="p-2 border-t border-border">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') { setNewTitle(''); setAdding(false); }
            }}
            placeholder="Task title..."
            className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm
                       focus:border-primary focus:outline-none text-foreground"
            autoFocus
          />
        </div>
      ) : (
        <button
          data-add-task
          onClick={() => setAdding(true)}
          className="p-2 text-xs text-muted-foreground hover:text-foreground
                     border-t border-border transition-colors text-left"
        >
          + Add task <span className="text-muted-foreground/50 ml-1">T</span>
        </button>
      )}
    </div>
  );
}

function getNextStatus(current: TaskStatus): TaskStatus {
  const flow: TaskStatus[] = ['idea', 'writing', 'submitted', 'testing', 'done'];
  const idx = flow.indexOf(current);
  if (idx === -1) return 'idea';
  return flow[(idx + 1) % flow.length];
}
