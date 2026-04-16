'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ITask, ISubProjectWithStats, TaskStatus } from '@/types';
import { statusIcon } from './StatusFlow';

function subProjectStatus(sp: ISubProjectWithStats): { dotClass: string; label: string; title: string } | null {
  if (sp.task_count === 0) return null;
  if (sp.problem_count > 0) return { dotClass: 'bg-destructive', label: `${sp.problem_count}!`, title: `${sp.problem_count} problem` };
  if (sp.done_count === sp.task_count) return { dotClass: 'bg-success', label: `${sp.done_count}/${sp.task_count}`, title: 'All done' };
  if (sp.done_count > 0) return { dotClass: 'bg-primary', label: `${sp.done_count}/${sp.task_count}`, title: `${sp.done_count} done, ${sp.active_count} active` };
  if (sp.active_count > 0) return { dotClass: 'bg-warning', label: `${sp.active_count}`, title: `${sp.active_count} in progress` };
  return null;
}

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
  onRenameSub,
  onCreateTask,
  onStatusChange,
  onTodayToggle,
  onDeleteTask,
  onReorderSubs,
  onReorderTasks,
  onAutoDistribute,
  chatStates,
}: {
  subProjects: ISubProjectWithStats[];
  tasks: ITask[];
  selectedSubId: string | null;
  selectedTaskId: string | null;
  onSelectSub: (subId: string) => void;
  onSelectTask: (taskId: string) => void;
  onCreateSub: () => void;
  onDeleteSub: (subId: string) => void;
  onRenameSub?: (subId: string, name: string) => void;
  onCreateTask: (title: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onTodayToggle: (taskId: string, isToday: boolean) => void;
  onDeleteTask: (taskId: string) => void;
  onReorderSubs?: (orderedIds: string[]) => void;
  onReorderTasks?: (orderedIds: string[]) => void;
  onAutoDistribute?: () => void;
  chatStates?: Record<string, 'idle' | 'loading' | 'done'>;
}) {
  const [collapsedSubs, setCollapsedSubs] = useState<Set<string>>(new Set());
  const [addingTaskFor, setAddingTaskFor] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorderSubs) return;

    const oldIndex = subProjects.findIndex(sp => sp.id === active.id);
    const newIndex = subProjects.findIndex(sp => sp.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = [...subProjects];
    const [moved] = newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, moved);
    onReorderSubs(newOrder.map(sp => sp.id));
  };

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const allCollapsed = subProjects.length > 0 && subProjects.every(sp => collapsedSubs.has(sp.id));
              setCollapsedSubs(allCollapsed ? new Set() : new Set(subProjects.map(sp => sp.id)));
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            title={subProjects.length > 0 && subProjects.every(sp => collapsedSubs.has(sp.id)) ? 'Expand all' : 'Collapse all'}
          >
            {subProjects.length > 0 && subProjects.every(sp => collapsedSubs.has(sp.id)) ? '\u25B6' : '\u25BC'}
          </button>
          {onAutoDistribute && (
            <button
              onClick={onAutoDistribute}
              className="text-[10px] px-1.5 py-0.5 bg-accent/15 text-accent border border-accent/30 rounded hover:bg-accent/25 transition-colors"
              title="AI auto-distribute brainstorming to tasks"
            >
              Auto
            </button>
          )}
          <button
            onClick={onCreateSub}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="Add project (N)"
          >
            + <span className="text-muted-foreground/50">N</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {subProjects.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-xs">
            Create a project to get started
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={subProjects.map(sp => sp.id)} strategy={verticalListSortingStrategy}>
            {subProjects.map((sp) => (
              <SortableSubProject
                key={sp.id}
                sp={sp}
                isSelected={selectedSubId === sp.id}
                isCollapsed={collapsedSubs.has(sp.id)}
                tasks={selectedSubId === sp.id ? tasks : []}
                selectedTaskId={selectedTaskId}
                addingTaskFor={addingTaskFor}
                newTaskTitle={newTaskTitle}
                onSelectSub={onSelectSub}
                onSelectTask={onSelectTask}
                onToggleCollapse={toggleCollapse}
                onDeleteSub={onDeleteSub}
                onRenameSub={onRenameSub}
                onStatusChange={onStatusChange}
                onTodayToggle={onTodayToggle}
                onDeleteTask={onDeleteTask}
                onReorderTasks={onReorderTasks}
                onAddTask={handleAddTask}
                onSetAddingTaskFor={setAddingTaskFor}
                onSetNewTaskTitle={setNewTaskTitle}
                chatStates={chatStates}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

function SortableSubProject({
  sp,
  isSelected,
  isCollapsed,
  tasks: subTasks,
  selectedTaskId,
  addingTaskFor,
  newTaskTitle,
  onSelectSub,
  onSelectTask,
  onToggleCollapse,
  onDeleteSub,
  onRenameSub,
  onStatusChange,
  onTodayToggle,
  onDeleteTask,
  onReorderTasks,
  onAddTask,
  onSetAddingTaskFor,
  onSetNewTaskTitle,
  chatStates,
}: {
  sp: ISubProjectWithStats;
  isSelected: boolean;
  isCollapsed: boolean;
  tasks: ITask[];
  selectedTaskId: string | null;
  addingTaskFor: string | null;
  newTaskTitle: string;
  onSelectSub: (subId: string) => void;
  onSelectTask: (taskId: string) => void;
  onToggleCollapse: (subId: string) => void;
  onDeleteSub: (subId: string) => void;
  onRenameSub?: (subId: string, name: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onTodayToggle: (taskId: string, isToday: boolean) => void;
  onDeleteTask: (taskId: string) => void;
  onReorderTasks?: (orderedIds: string[]) => void;
  onAddTask: (subId: string) => void;
  onSetAddingTaskFor: (subId: string | null) => void;
  onSetNewTaskTitle: (title: string) => void;
  chatStates?: Record<string, 'idle' | 'loading' | 'done'>;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(sp.name);

  const taskSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleTaskDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorderTasks) return;
    const oldIndex = subTasks.findIndex(t => t.id === active.id);
    const newIndex = subTasks.findIndex(t => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = [...subTasks];
    const [moved] = newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, moved);
    onReorderTasks(newOrder.map(t => t.id));
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sp.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const handleRenameSubmit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== sp.name && onRenameSub) {
      onRenameSub(sp.id, trimmed);
    }
    setEditing(false);
  };

  return (
    <div ref={setNodeRef} style={style} className="mb-0.5">
      {/* Sub-project node */}
      <div
        onClick={() => {
          if (editing) return;
          if (isSelected) {
            onToggleCollapse(sp.id);
          } else {
            onSelectSub(sp.id);
            if (isCollapsed) onToggleCollapse(sp.id);
          }
        }}
        className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer transition-colors group text-sm ${
          isSelected
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {/* Drag handle */}
        <span
          {...attributes}
          {...listeners}
          className="w-4 h-4 flex items-center justify-center text-xs text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0"
          title="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
        >
          ⠿
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(sp.id); }}
          className="w-4 h-4 flex items-center justify-center text-xs text-muted-foreground flex-shrink-0"
        >
          {isCollapsed ? '\u25B6' : '\u25BC'}
        </button>
        {(() => {
          const st = subProjectStatus(sp);
          if (!st) return null;
          return <span className={`w-2 h-2 rounded-full ${st.dotClass} flex-shrink-0`} title={st.title} />;
        })()}
        {editing ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit();
              if (e.key === 'Escape') { setEditValue(sp.name); setEditing(false); }
            }}
            onBlur={handleRenameSubmit}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-input border border-primary rounded px-1 py-0 text-sm font-medium focus:outline-none text-foreground"
            autoFocus
          />
        ) : (
          <span
            className={`flex-1 truncate font-medium ${isSelected ? 'text-primary' : ''}`}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditValue(sp.name);
              setEditing(true);
            }}
            title="Double-click to rename"
          >
            {sp.name}
          </span>
        )}
        <div className="flex items-center gap-1.5">
          {sp.task_count > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">{sp.task_count}</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setEditValue(sp.name); setEditing(true); }}
            className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity text-xs"
            title="Rename"
          >
            ✎
          </button>
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
          <DndContext sensors={taskSensors} collisionDetection={closestCenter} onDragEnd={handleTaskDragEnd}>
            <SortableContext items={subTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {subTasks.map((task) => (
                <SortableTask
                  key={task.id}
                  task={task}
                  isSelected={selectedTaskId === task.id}
                  chatState={chatStates?.[task.id]}
                  onSelect={() => onSelectTask(task.id)}
                  onStatusChange={onStatusChange}
                  onTodayToggle={onTodayToggle}
                  onDelete={() => onDeleteTask(task.id)}
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* Add task input */}
          {addingTaskFor === sp.id ? (
            <div className="pl-4 pr-2 py-1">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => onSetNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onAddTask(sp.id);
                  if (e.key === 'Escape') { onSetNewTaskTitle(''); onSetAddingTaskFor(null); }
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
              onClick={() => { onSelectSub(sp.id); onSetAddingTaskFor(sp.id); }}
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
}

function SortableTask({
  task,
  isSelected,
  chatState,
  onSelect,
  onStatusChange,
  onTodayToggle,
  onDelete,
}: {
  task: ITask;
  isSelected: boolean;
  chatState?: 'idle' | 'loading' | 'done';
  onSelect: () => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onTodayToggle: (taskId: string, isToday: boolean) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`group/task flex items-center gap-1 pl-2 pr-2 py-1.5 cursor-pointer transition-colors text-sm border-l-2 ${
        isSelected ? 'bg-card-hover border-l-primary' : 'border-l-transparent hover:bg-card-hover/50'
      }`}
    >
      <span
        {...attributes}
        {...listeners}
        className="w-3 h-4 flex items-center justify-center text-[10px] text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        ⠿
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, getNextStatus(task.status)); }}
        className="flex-shrink-0 text-sm"
        title={`Status: ${task.status}`}
      >
        {statusIcon(task.status)}
      </button>
      <span className={`tree-priority-dot ${PRIORITY_COLORS[task.priority]}`} />
      <span className={`flex-1 truncate ${task.status === 'done' ? 'text-muted-foreground line-through' : ''}`}>
        {task.title}
      </span>
      {chatState === 'loading' && (
        <span className="flex-shrink-0 flex items-center gap-1 text-[10px] text-warning">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
        </span>
      )}
      {chatState === 'done' && <span className="flex-shrink-0 text-[10px] text-success">✓</span>}
      {task.is_today && (
        <button onClick={(e) => { e.stopPropagation(); onTodayToggle(task.id, false); }} className="text-xs flex-shrink-0 text-primary">*</button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="flex-shrink-0 text-muted-foreground/0 group-hover/task:text-muted-foreground hover:!text-destructive transition-colors text-xs px-0.5"
      >
        ×
      </button>
    </div>
  );
}

function getNextStatus(current: TaskStatus): TaskStatus {
  const flow: TaskStatus[] = ['idea', 'doing', 'done'];
  const idx = flow.indexOf(current);
  if (idx === -1) return 'idea';
  return flow[(idx + 1) % flow.length];
}
