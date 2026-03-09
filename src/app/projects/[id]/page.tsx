'use client';

import { useState, useEffect, useCallback, useRef, use, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Editor from '@/components/brainstorm/Editor';
import ProjectTree from '@/components/task/ProjectTree';
import TaskDetail from '@/components/task/TaskDetail';
import DirectoryPicker from '@/components/DirectoryPicker';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import AiPolicyModal from '@/components/ui/AiPolicyModal';
import type { ISubProject, ITask, TaskStatus, ISubProjectWithStats } from '@/types';

interface IProject {
  id: string;
  name: string;
  description: string;
  project_path: string | null;
  ai_context: string;
}

function WorkspaceInner({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialUrlSub = useRef(searchParams.get('sub'));
  const initialUrlTask = useRef(searchParams.get('task'));

  const [project, setProject] = useState<IProject | null>(null);
  const [subProjects, setSubProjects] = useState<ISubProjectWithStats[]>([]);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<ITask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showDirPicker, setShowDirPicker] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete-sub' | 'delete-task'; id: string } | null>(null);
  const [showAddSub, setShowAddSub] = useState(false);
  const [showBrainstorm, setShowBrainstorm] = useState(true);
  const [newSubName, setNewSubName] = useState('');
  const [showAiPolicy, setShowAiPolicy] = useState(false);

  // Resizable panel widths
  const [leftWidth, setLeftWidth] = useState(500);
  const [centerWidth, setCenterWidth] = useState(500);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<'left' | 'center' | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback((panel: 'left' | 'center', e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = panel;
    startXRef.current = e.clientX;
    startWidthRef.current = panel === 'left' ? leftWidth : centerWidth;
  }, [leftWidth, centerWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.max(180, Math.min(500, startWidthRef.current + delta));
      if (draggingRef.current === 'left') setLeftWidth(newWidth);
      else setCenterWidth(newWidth);
    };
    const handleMouseUp = () => { draggingRef.current = null; };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Load project
  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then(r => { if (!r.ok) { router.push('/'); return null; } return r.json(); })
      .then(data => data && setProject(data));
  }, [id, router]);

  // Load sub-projects (stable callback, no deps on selection state)
  const loadSubProjects = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/sub-projects`);
    if (!res.ok) return;
    const data: ISubProjectWithStats[] = await res.json();
    setSubProjects(data);
    return data;
  }, [id]);

  // Initial load: sub-projects + auto-select from URL
  useEffect(() => {
    loadSubProjects().then(data => {
      if (!data || data.length === 0) return;
      const urlSub = initialUrlSub.current;
      if (urlSub && data.some(s => s.id === urlSub)) {
        setSelectedSubId(urlSub);
      } else {
        setSelectedSubId(data[0].id);
      }
    });
  }, [loadSubProjects]);

  // Load tasks when sub-project changes
  useEffect(() => {
    if (!selectedSubId) { setTasks([]); return; }
    fetch(`/api/projects/${id}/sub-projects/${selectedSubId}/tasks`)
      .then(r => r.json())
      .then((data: ITask[]) => {
        setTasks(data);
        // Auto-select from URL on first load only
        const urlTask = initialUrlTask.current;
        if (urlTask && data.some(t => t.id === urlTask)) {
          setSelectedTaskId(urlTask);
          initialUrlTask.current = null; // consume once
        }
      });
  }, [id, selectedSubId]);

  const selectedTask = tasks.find(t => t.id === selectedTaskId) ?? null;

  const handleCreateSubProject = async () => {
    if (!newSubName.trim()) return;
    const res = await fetch(`/api/projects/${id}/sub-projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSubName.trim() }),
    });
    if (res.ok) {
      const sp: ISubProject = await res.json();
      setNewSubName('');
      setShowAddSub(false);
      await loadSubProjects();
      setSelectedSubId(sp.id);
    }
  };

  const handleDeleteSubProject = (subId: string) => {
    setConfirmAction({ type: 'delete-sub', id: subId });
  };

  const handleCreateTask = async (title: string) => {
    if (!selectedSubId) return;
    const res = await fetch(`/api/projects/${id}/sub-projects/${selectedSubId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      const task: ITask = await res.json();
      setTasks(prev => [...prev, task]);
      setSelectedTaskId(task.id);
      loadSubProjects();
    }
  };

  const handleTaskStatusChange = async (taskId: string, status: TaskStatus) => {
    const res = await fetch(`/api/projects/${id}/sub-projects/${selectedSubId}/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated: ITask = await res.json();
      setTasks(prev => prev.map(t => t.id === taskId ? updated : t));
      loadSubProjects();
    }
  };

  const handleTaskTodayToggle = async (taskId: string, isToday: boolean) => {
    const res = await fetch(`/api/projects/${id}/sub-projects/${selectedSubId}/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_today: isToday }),
    });
    if (res.ok) {
      const updated: ITask = await res.json();
      setTasks(prev => prev.map(t => t.id === taskId ? updated : t));
    }
  };

  const handleTaskUpdate = async (data: Partial<ITask>) => {
    if (!selectedTaskId || !selectedSubId) return;
    const res = await fetch(`/api/projects/${id}/sub-projects/${selectedSubId}/tasks/${selectedTaskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated: ITask = await res.json();
      setTasks(prev => prev.map(t => t.id === selectedTaskId ? updated : t));
      loadSubProjects();
    }
  };

  const handleTaskDelete = () => {
    if (!selectedTaskId) return;
    setConfirmAction({ type: 'delete-task', id: selectedTaskId });
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    if (confirmAction.type === 'delete-sub') {
      await fetch(`/api/projects/${id}/sub-projects/${confirmAction.id}`, { method: 'DELETE' });
      if (selectedSubId === confirmAction.id) {
        setSelectedSubId(null);
        setSelectedTaskId(null);
      }
      loadSubProjects();
    } else if (confirmAction.type === 'delete-task') {
      await fetch(`/api/projects/${id}/sub-projects/${selectedSubId}/tasks/${confirmAction.id}`, { method: 'DELETE' });
      setTasks(prev => prev.filter(t => t.id !== confirmAction.id));
      if (selectedTaskId === confirmAction.id) setSelectedTaskId(null);
      loadSubProjects();
    }
    setConfirmAction(null);
  };

  const handleSetPath = async (selectedPath: string) => {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_path: selectedPath }),
    });
    if (res.ok) {
      setProject(await res.json());
      setShowDirPicker(false);
    }
  };

  const handleSaveAiPolicy = async (aiContext: string) => {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_context: aiContext }),
    });
    if (res.ok) {
      setProject(await res.json());
      setShowAiPolicy(false);
    }
  };

  // Keyboard shortcuts (use e.code for Korean IME compatibility)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      // B — toggle brainstorming panel
      if (!isInput && e.code === 'KeyB' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowBrainstorm(prev => !prev);
        return;
      }

      // N — new sub-project (when not in input)
      if (!isInput && e.code === 'KeyN' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowAddSub(true);
        return;
      }

      // T — new task (when sub-project selected, not in input)
      if (!isInput && e.code === 'KeyT' && !e.metaKey && !e.ctrlKey && selectedSubId) {
        e.preventDefault();
        const addBtn = document.querySelector('[data-add-task]') as HTMLButtonElement;
        addBtn?.click();
        return;
      }

      // Cmd+1~6 — status change
      if (selectedTaskId && selectedSubId && !isInput) {
        const statusMap: Record<string, TaskStatus> = {
          'Digit1': 'idea', 'Digit2': 'writing', 'Digit3': 'submitted',
          'Digit4': 'testing', 'Digit5': 'done', 'Digit6': 'problem',
        };

        if ((e.metaKey || e.ctrlKey) && statusMap[e.code]) {
          e.preventDefault();
          handleTaskStatusChange(selectedTaskId, statusMap[e.code]);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  if (!project) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-sm px-2 py-1 rounded-md"
          >
            &larr; Back
          </button>
          <span className="text-border">|</span>
          <h1 className="text-sm font-semibold">{project.name}</h1>
          {project.project_path && (
            <span className="text-xs text-muted-foreground font-mono truncate max-w-48" title={project.project_path}>
              {project.project_path}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAiPolicy(true)}
            className={`px-3 py-1.5 text-xs border rounded-md transition-colors ${
              project.ai_context
                ? 'bg-accent/15 text-accent border-accent/30 hover:bg-accent/25'
                : 'bg-muted hover:bg-card-hover text-muted-foreground border-border'
            }`}
          >
            AI Policy{project.ai_context ? ' *' : ''}
          </button>
          {!project.project_path && (
            <button
              onClick={() => setShowDirPicker(true)}
              className="px-3 py-1.5 text-xs bg-muted hover:bg-card-hover text-foreground
                         border border-border rounded-md transition-colors"
            >
              Link folder
            </button>
          )}
        </div>
      </header>

      {/* 3-Panel Layout with resize handles */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        {/* Left: Brainstorming (collapsible) */}
        {showBrainstorm ? (
          <>
            <div style={{ width: leftWidth }} className="border-r border-border flex flex-col flex-shrink-0">
              <Editor
                projectId={id}
                onCollapse={() => setShowBrainstorm(false)}
              />
            </div>
            {/* Resize handle: left */}
            <div
              className="panel-resize-handle"
              onMouseDown={(e) => handleMouseDown('left', e)}
            >
              <div className="panel-resize-handle-bar" />
            </div>
          </>
        ) : (
          <button
            onClick={() => setShowBrainstorm(true)}
            className="w-8 border-r border-border flex-shrink-0 flex items-center justify-center
                       text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors
                       text-xs"
            title="Show brainstorming (B)"
            style={{ writingMode: 'vertical-rl' }}
          >
            Brainstorm
          </button>
        )}

        {/* Center: Tree (Sub-projects + Tasks) */}
        <div style={{ width: centerWidth }} className="border-r border-border flex flex-col flex-shrink-0">
          {/* Add sub-project input */}
          {showAddSub && (
            <div className="px-3 py-2 border-b border-border">
              <input
                type="text"
                value={newSubName}
                onChange={(e) => setNewSubName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSubProject();
                  if (e.key === 'Escape') { setNewSubName(''); setShowAddSub(false); }
                }}
                placeholder="Sub-project name..."
                className="w-full bg-input border border-border rounded px-2 py-1 text-xs
                           focus:border-primary focus:outline-none text-foreground"
                autoFocus
              />
            </div>
          )}

          <ProjectTree
            subProjects={subProjects}
            tasks={tasks}
            selectedSubId={selectedSubId}
            selectedTaskId={selectedTaskId}
            onSelectSub={(subId) => { setSelectedSubId(subId); setSelectedTaskId(null); }}
            onSelectTask={setSelectedTaskId}
            onCreateSub={() => setShowAddSub(true)}
            onDeleteSub={handleDeleteSubProject}
            onCreateTask={handleCreateTask}
            onStatusChange={handleTaskStatusChange}
            onTodayToggle={handleTaskTodayToggle}
          />
        </div>

        {/* Resize handle: center */}
        <div
          className="panel-resize-handle"
          onMouseDown={(e) => handleMouseDown('center', e)}
        >
          <div className="panel-resize-handle-bar" />
        </div>

        {/* Right: Task Detail */}
        <div className="flex-1 min-w-0">
          {selectedTask ? (
            <TaskDetail
              task={selectedTask}
              projectId={id}
              subProjectId={selectedSubId!}
              onUpdate={handleTaskUpdate}
              onDelete={handleTaskDelete}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {tasks.length > 0 ? 'Select a task' : selectedSubId ? 'Create a task to get started' : 'Select a sub-project'}
            </div>
          )}
        </div>
      </div>

      {showDirPicker && (
        <DirectoryPicker
          onSelect={handleSetPath}
          onCancel={() => setShowDirPicker(false)}
          initialPath={project.project_path || undefined}
        />
      )}

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.type === 'delete-sub' ? 'Delete sub-project?' : 'Delete task?'}
        description={confirmAction?.type === 'delete-sub'
          ? 'This will delete the sub-project and all its tasks.'
          : 'This task will be permanently deleted.'}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />

      <AiPolicyModal
        open={showAiPolicy}
        content={project.ai_context || ''}
        onSave={handleSaveAiPolicy}
        onClose={() => setShowAiPolicy(false)}
      />
    </div>
  );
}

export default function ProjectWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>}>
      <WorkspaceInner id={id} />
    </Suspense>
  );
}
