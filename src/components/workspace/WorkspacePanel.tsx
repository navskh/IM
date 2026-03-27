'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTabContext } from '@/components/tabs/TabContext';
import Editor from '@/components/brainstorm/Editor';
import ProjectTree from '@/components/task/ProjectTree';
import TaskDetail from '@/components/task/TaskDetail';
import DirectoryPicker from '@/components/DirectoryPicker';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import AiPolicyModal from '@/components/ui/AiPolicyModal';
import GitSyncResultsModal from '@/components/dashboard/GitSyncResultsModal';
import FileTreeDrawer from '@/components/ui/FileTreeDrawer';
import AutoDistributeModal from '@/components/ui/AutoDistributeModal';
import type { ISubProject, ITask, TaskStatus, ISubProjectWithStats, IGitSyncResult } from '@/types';

interface IProject {
  id: string;
  name: string;
  description: string;
  project_path: string | null;
  ai_context: string;
  watch_enabled: boolean;
  agent_type: string;
}

export default function WorkspacePanel({
  id,
  initialSubId,
  initialTaskId,
}: {
  id: string;
  initialSubId?: string;
  initialTaskId?: string;
}) {
  const { state, setActiveTab, consumeInitial, updateTabName } = useTabContext();
  const isActive = state.activeTabId === id;

  const initialSubRef = useRef(initialSubId);
  const initialTaskRef = useRef(initialTaskId);

  // Update refs when new initial values come in (e.g. clicking Today task for already-open tab)
  useEffect(() => {
    if (initialSubId) initialSubRef.current = initialSubId;
    if (initialTaskId) initialTaskRef.current = initialTaskId;
    if (initialSubId || initialTaskId) {
      // Apply the selection
      if (initialSubId) setSelectedSubId(initialSubId);
      if (initialTaskId) setSelectedTaskId(initialTaskId);
      consumeInitial(id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSubId, initialTaskId]);

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
  const [syncing, setSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<IGitSyncResult[] | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [showFileTree, setShowFileTree] = useState(false);
  const [showAutoDistribute, setShowAutoDistribute] = useState(false);
  const [chatStates, setChatStates] = useState<Record<string, 'idle' | 'loading' | 'done'>>({});
  const syncingRef = useRef(false);

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
      const newWidth = Math.max(180, Math.min(900, startWidthRef.current + delta));
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
      .then(r => { if (!r.ok) return null; return r.json(); })
      .then(data => {
        if (data) {
          setProject(data);
          updateTabName(id, data.name);
        }
      });
  }, [id, updateTabName]);

  // Load sub-projects
  const loadSubProjects = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/sub-projects`);
    if (!res.ok) return;
    const data: ISubProjectWithStats[] = await res.json();
    setSubProjects(data);
    return data;
  }, [id]);

  // Initial load
  useEffect(() => {
    loadSubProjects().then(data => {
      if (!data || data.length === 0) return;
      const urlSub = initialSubRef.current;
      if (urlSub && data.some(s => s.id === urlSub)) {
        setSelectedSubId(urlSub);
      } else if (!selectedSubId) {
        setSelectedSubId(data[0].id);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSubProjects]);

  // Load tasks when sub-project changes
  useEffect(() => {
    if (!selectedSubId) { setTasks([]); return; }
    fetch(`/api/projects/${id}/sub-projects/${selectedSubId}/tasks`)
      .then(r => r.json())
      .then((data: ITask[]) => {
        setTasks(data);
        const urlTask = initialTaskRef.current;
        if (urlTask && data.some(t => t.id === urlTask)) {
          setSelectedTaskId(urlTask);
          initialTaskRef.current = undefined;
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

  const handleReorderSubs = async (orderedIds: string[]) => {
    // Optimistic update
    setSubProjects(prev => {
      const map = new Map(prev.map(sp => [sp.id, sp]));
      return orderedIds.map(id => map.get(id)!).filter(Boolean);
    });

    await fetch(`/api/projects/${id}/sub-projects`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds }),
    });
  };

  const handleTaskDelete = (taskId?: string) => {
    const tid = taskId || selectedTaskId;
    if (!tid) return;
    setConfirmAction({ type: 'delete-task', id: tid });
  };

  const handleConfirmAction = async (mode?: 'archive' | 'permanent') => {
    if (!confirmAction) return;
    if (confirmAction.type === 'delete-sub') {
      await fetch(`/api/projects/${id}/sub-projects/${confirmAction.id}`, { method: 'DELETE' });
      if (selectedSubId === confirmAction.id) {
        setSelectedSubId(null);
        setSelectedTaskId(null);
      }
      loadSubProjects();
    } else if (confirmAction.type === 'delete-task') {
      const m = mode || 'archive';
      await fetch(`/api/projects/${id}/sub-projects/${selectedSubId}/tasks/${confirmAction.id}?mode=${m}`, { method: 'DELETE' });
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

  const handleGitSync = useCallback(async (silent = false) => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (!silent) setSyncing(true);
    try {
      const res = await fetch(`/api/projects/${id}/git-sync`, { method: 'POST' });
      if (res.ok) {
        const results: IGitSyncResult[] = await res.json();
        setLastSyncTime(new Date());
        if (!silent) {
          setSyncResults(results);
        }
      }
    } catch {
      // silent fail
    } finally {
      syncingRef.current = false;
      if (!silent) setSyncing(false);
    }
  }, [id]);

  // Auto git-sync every 30 minutes
  useEffect(() => {
    if (!project?.project_path) return;
    const INTERVAL_MS = 30 * 60 * 1000;
    const timer = setInterval(() => handleGitSync(true), INTERVAL_MS);
    return () => clearInterval(timer);
  }, [project?.project_path, handleGitSync]);

  const handleToggleWatch = async () => {
    if (!project) return;
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ watch_enabled: !project.watch_enabled }),
    });
    if (res.ok) {
      setProject(await res.json());
    }
  };

  // Keyboard shortcuts — only active when this tab is focused
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isActive) return;
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      if (!isInput && e.code === 'KeyB' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowBrainstorm(prev => !prev);
        return;
      }
      if (!isInput && e.code === 'KeyN' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowAddSub(true);
        return;
      }
      if (!isInput && e.code === 'KeyT' && !e.metaKey && !e.ctrlKey && selectedSubId) {
        e.preventDefault();
        const addBtn = document.querySelector('[data-add-task]') as HTMLButtonElement;
        addBtn?.click();
        return;
      }
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
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('dashboard')}
            className="text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-sm px-2 py-1 rounded-md"
          >
            &larr; Back
          </button>
          <span className="text-border">|</span>
          <h1 className="text-sm font-semibold">{project.name}</h1>
          {project.project_path && (
            <>
              <span className="text-xs text-muted-foreground font-mono truncate max-w-48" title={project.project_path}>
                {project.project_path}
              </span>
              <button
                onClick={() => setShowFileTree(true)}
                className="text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors px-1.5 py-0.5 rounded"
                title="View file tree"
              >
                {'\uD83D\uDCC2'}
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={project.agent_type || 'claude'}
            onChange={async (e) => {
              const res = await fetch(`/api/projects/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agent_type: e.target.value }),
              });
              if (res.ok) setProject(await res.json());
            }}
            className="px-2 py-1.5 text-xs bg-muted border border-border rounded-md text-foreground cursor-pointer hover:bg-card-hover transition-colors"
            title="AI Agent"
          >
            <option value="claude">Claude</option>
            <option value="gemini">Gemini</option>
            <option value="codex">Codex</option>
          </select>
          <button onClick={handleToggleWatch}
            className={`px-3 py-1.5 text-xs border rounded-md transition-colors flex items-center gap-1.5 ${
              project.watch_enabled
                ? 'bg-success/15 text-success border-success/30 hover:bg-success/25'
                : 'bg-muted hover:bg-card-hover text-muted-foreground border-border'
            }`}
            title={project.watch_enabled ? 'Watch ON' : 'Watch OFF'}>
            <span className={`inline-block w-2 h-2 rounded-full ${project.watch_enabled ? 'bg-success animate-pulse' : 'bg-muted-foreground/40'}`} />
            Watch
          </button>
          <button onClick={() => setShowAiPolicy(true)}
            className={`px-3 py-1.5 text-xs border rounded-md transition-colors ${
              project.ai_context
                ? 'bg-accent/15 text-accent border-accent/30 hover:bg-accent/25'
                : 'bg-muted hover:bg-card-hover text-muted-foreground border-border'
            }`}>
            AI Policy{project.ai_context ? ' *' : ''}
          </button>
          {project.project_path ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleGitSync(false)}
                disabled={syncing}
                className="px-3 py-1.5 text-xs bg-muted hover:bg-card-hover text-foreground border border-border rounded-md transition-colors disabled:opacity-50 flex items-center gap-1.5"
                title={lastSyncTime ? `Last sync: ${lastSyncTime.toLocaleTimeString()}` : 'Git pull'}
              >
                <span className={syncing ? 'animate-spin' : ''}>&#x21bb;</span>
                {syncing ? 'Syncing...' : 'Git Sync'}
              </button>
              {lastSyncTime && (
                <span className="text-xs text-muted-foreground">
                  {lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          ) : (
            <button onClick={() => setShowDirPicker(true)}
              className="px-3 py-1.5 text-xs bg-muted hover:bg-card-hover text-foreground border border-border rounded-md transition-colors">
              Link folder
            </button>
          )}
        </div>
      </header>

      {/* 3-Panel Layout */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        {showBrainstorm ? (
          <>
            <div style={{ width: leftWidth }} className="border-r border-border flex flex-col flex-shrink-0">
              <Editor projectId={id} onCollapse={() => setShowBrainstorm(false)} />
            </div>
            <div className="panel-resize-handle" onMouseDown={(e) => handleMouseDown('left', e)}>
              <div className="panel-resize-handle-bar" />
            </div>
          </>
        ) : (
          <button onClick={() => setShowBrainstorm(true)}
            className="w-8 border-r border-border flex-shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card-hover transition-colors text-xs"
            title="Show brainstorming (B)" style={{ writingMode: 'vertical-rl' }}>
            Brainstorm
          </button>
        )}

        <div style={{ width: centerWidth }} className="border-r border-border flex flex-col flex-shrink-0">
          {showAddSub && (
            <div className="px-3 py-2 border-b border-border">
              <input type="text" value={newSubName} onChange={(e) => setNewSubName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSubProject();
                  if (e.key === 'Escape') { setNewSubName(''); setShowAddSub(false); }
                }}
                placeholder="Sub-project name..."
                className="w-full bg-input border border-border rounded px-2 py-1 text-xs focus:border-primary focus:outline-none text-foreground"
                autoFocus />
            </div>
          )}
          <ProjectTree subProjects={subProjects} tasks={tasks}
            selectedSubId={selectedSubId} selectedTaskId={selectedTaskId}
            onSelectSub={(subId) => { setSelectedSubId(subId); setSelectedTaskId(null); }}
            onSelectTask={(taskId) => {
              setSelectedTaskId(taskId);
              setChatStates(prev => {
                if (prev[taskId] !== 'done') return prev;
                const next = { ...prev };
                delete next[taskId];
                return next;
              });
            }}
            onCreateSub={() => setShowAddSub(true)} onDeleteSub={handleDeleteSubProject}
            onCreateTask={handleCreateTask} onStatusChange={handleTaskStatusChange}
            onTodayToggle={handleTaskTodayToggle} onDeleteTask={handleTaskDelete}
            onReorderSubs={handleReorderSubs}
            onAutoDistribute={() => setShowAutoDistribute(true)}
            chatStates={chatStates} />
        </div>

        <div className="panel-resize-handle" onMouseDown={(e) => handleMouseDown('center', e)}>
          <div className="panel-resize-handle-bar" />
        </div>

        <div className="flex-1 min-w-0">
          {selectedTask ? (
            <TaskDetail task={selectedTask} projectId={id} subProjectId={selectedSubId!}
              onUpdate={handleTaskUpdate} onDelete={handleTaskDelete}
              onChatStateChange={(taskId, state) => {
                setChatStates(prev => ({ ...prev, [taskId]: state }));
              }} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {tasks.length > 0 ? 'Select a task' : selectedSubId ? 'Create a task to get started' : 'Select a sub-project'}
            </div>
          )}
        </div>
      </div>

      {showDirPicker && (
        <DirectoryPicker onSelect={handleSetPath} onCancel={() => setShowDirPicker(false)}
          initialPath={project.project_path || undefined} />
      )}
      <ConfirmDialog open={confirmAction?.type === 'delete-sub'}
        title="Delete sub-project?"
        description="This will delete the sub-project and all its tasks."
        confirmLabel="Delete" variant="danger"
        onConfirm={() => handleConfirmAction()} onCancel={() => setConfirmAction(null)} />
      {confirmAction?.type === 'delete-task' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}>
          <div className="bg-card border border-border rounded-xl shadow-2xl shadow-black/40 w-full max-w-sm mx-4 animate-dialog-in">
            <div className="p-5">
              <h3 className="text-sm font-semibold text-foreground">Remove task</h3>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                보관함에 넣으면 나중에 복원하거나 프롬프트를 참고할 수 있습니다.
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 pb-4">
              <button onClick={() => setConfirmAction(null)}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground bg-muted hover:bg-card-hover border border-border rounded-md transition-colors">
                Cancel
              </button>
              <button onClick={() => handleConfirmAction('permanent')}
                className="px-3 py-1.5 text-xs text-white bg-destructive hover:bg-destructive/80 rounded-md transition-colors">
                Delete
              </button>
              <button onClick={() => handleConfirmAction('archive')}
                className="px-3 py-1.5 text-xs text-white bg-primary hover:bg-primary-hover rounded-md transition-colors">
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
      <AiPolicyModal open={showAiPolicy} content={project.ai_context || ''}
        onSave={handleSaveAiPolicy} onClose={() => setShowAiPolicy(false)} />
      <GitSyncResultsModal
        open={!!syncResults}
        results={syncResults || []}
        onClose={() => setSyncResults(null)}
      />
      {showFileTree && project.project_path && (
        <FileTreeDrawer
          rootPath={project.project_path}
          onClose={() => setShowFileTree(false)}
        />
      )}
      <AutoDistributeModal
        open={showAutoDistribute}
        projectId={id}
        onClose={() => setShowAutoDistribute(false)}
        onApplied={() => { loadSubProjects(); }}
      />
    </div>
  );
}
