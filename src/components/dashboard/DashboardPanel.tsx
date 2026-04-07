'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTabContext } from '@/components/tabs/TabContext';
import DirectoryPicker from '@/components/DirectoryPicker';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DashboardTabBar, { type DashboardTab } from '@/components/dashboard/TabBar';
import SubProjectCard from '@/components/dashboard/SubProjectCard';
import type { ISubProjectWithStats, ITask } from '@/types';

interface IProject {
  id: string;
  name: string;
  description: string;
  project_path: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectWithSubs extends IProject {
  subProjects: ISubProjectWithStats[];
}

export default function DashboardPanel() {
  const { state, openProject, closeTab } = useTabContext();
  const isVisible = state.activeTabId === 'dashboard';

  const [projects, setProjects] = useState<ProjectWithSubs[]>([]);
  const [todayTasks, setTodayTasks] = useState<(ITask & { projectName: string; subProjectName: string })[]>([]);
  const [allTasks, setAllTasks] = useState<(ITask & { projectName: string; subProjectName: string })[]>([]);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [showDirPicker, setShowDirPicker] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<ProjectWithSubs | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPath, setEditPath] = useState('');
  const [showEditDirPicker, setShowEditDirPicker] = useState(false);
  const [archivedTasks, setArchivedTasks] = useState<(ITask & { projectName?: string; subProjectName?: string })[]>([]);
  const [memoContent, setMemoContent] = useState('');
  const [showSync, setShowSync] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ initialized: boolean; remoteUrl?: string; lastCommit?: string } | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [syncRepoUrl, setSyncRepoUrl] = useState('');
  const [memoOpen, setMemoOpen] = useState(false);
  const memoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tab, setTab] = useState<DashboardTab>('active');

  const fetchData = useCallback(async () => {
    const res = await fetch('/api/projects');
    const projectList: IProject[] = await res.json();

    const withSubs = await Promise.all(
      projectList.map(async (p) => {
        const subRes = await fetch(`/api/projects/${p.id}/sub-projects`);
        const subProjects: ISubProjectWithStats[] = await subRes.json();
        return { ...p, subProjects };
      })
    );

    setProjects(withSubs);

    // Gather all tasks
    const gathered: (ITask & { projectName: string; subProjectName: string })[] = [];
    for (const p of withSubs) {
      for (const sp of p.subProjects) {
        if (sp.task_count > 0) {
          const tasksRes = await fetch(`/api/projects/${p.id}/sub-projects/${sp.id}/tasks`);
          const tasks: ITask[] = await tasksRes.json();
          for (const t of tasks) {
            gathered.push({ ...t, projectName: p.name, subProjectName: sp.name });
          }
        }
      }
    }
    setAllTasks(gathered);
    setTodayTasks(gathered.filter(t => t.is_today));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    fetch('/api/global-memo').then(r => r.json()).then(d => setMemoContent(d.content || ''));
    // Restore localStorage state after mount
    const savedMemo = localStorage.getItem('im-memo-open');
    if (savedMemo === 'true') setMemoOpen(true);
    const savedTab = localStorage.getItem('im-dashboard-tab') as DashboardTab | null;
    if (savedTab) setTab(savedTab);
  }, [fetchData]);

  const handleMemoChange = (value: string) => {
    setMemoContent(value);
    if (memoSaveTimer.current) clearTimeout(memoSaveTimer.current);
    memoSaveTimer.current = setTimeout(() => {
      fetch('/api/global-memo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: value }),
      });
    }, 500);
  };

  const toggleMemo = () => {
    const next = !memoOpen;
    setMemoOpen(next);
    localStorage.setItem('im-memo-open', String(next));
  };

  // Refresh when tab becomes visible
  useEffect(() => {
    if (isVisible && !loading) fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  const loadArchive = useCallback(async () => {
    const res = await fetch('/api/archive');
    const tasks: ITask[] = await res.json();
    // Enrich with project/sub-project names
    const enriched = tasks.map(t => {
      const proj = projects.find(p => p.id === t.project_id);
      const sub = proj?.subProjects.find(sp => sp.id === t.sub_project_id);
      return { ...t, projectName: proj?.name, subProjectName: sub?.name };
    });
    setArchivedTasks(enriched);
  }, [projects]);

  const openSyncModal = async () => {
    setShowSync(true);
    setSyncMessage('');
    const res = await fetch('/api/sync');
    const data = await res.json();
    setSyncStatus(data);
  };

  const handleSyncAction = async (action: string) => {
    setSyncLoading(true);
    setSyncMessage('');
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, repoUrl: syncRepoUrl }),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncMessage(data.message || 'Success');
        if (action === 'init') {
          const status = await fetch('/api/sync').then(r => r.json());
          setSyncStatus(status);
        }
        if (action === 'pull') fetchData();
      } else {
        setSyncMessage(`Error: ${data.error}`);
      }
    } catch {
      setSyncMessage('Error: request failed');
    }
    setSyncLoading(false);
  };

  const handleTabChange = (newTab: DashboardTab) => {
    setTab(newTab);
    localStorage.setItem('im-dashboard-tab', newTab);
    if (newTab === 'archive') loadArchive();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), description: description.trim(), project_path: projectPath.trim() || undefined }),
    });

    if (res.ok) {
      const project = await res.json();
      setName('');
      setDescription('');
      setProjectPath('');
      setShowForm(false);
      openProject(project.id, project.name);
    }
  };

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(id);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await fetch(`/api/projects/${deleteTarget}`, { method: 'DELETE' });
    closeTab(deleteTarget); // Close tab if open
    setDeleteTarget(null);
    fetchData();
  };

  const handleEditClick = (project: ProjectWithSubs, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTarget(project);
    setEditName(project.name);
    setEditDescription(project.description);
    setEditPath(project.project_path || '');
  };

  const handleEditSave = async () => {
    if (!editTarget || !editName.trim()) return;
    const res = await fetch(`/api/projects/${editTarget.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editName.trim(),
        description: editDescription.trim(),
        project_path: editPath.trim() || null,
      }),
    });
    if (res.ok) {
      setEditTarget(null);
      fetchData();
    }
  };

  const getVisibleCards = (): { sp: ISubProjectWithStats; projectName: string; projectId: string }[] => {
    const cards: { sp: ISubProjectWithStats; projectName: string; projectId: string }[] = [];
    for (const p of projects) {
      for (const sp of p.subProjects) {
        if (tab === 'active') {
          if (sp.active_count > 0 || sp.problem_count > 0) {
            cards.push({ sp, projectName: p.name, projectId: p.id });
          }
        } else if (tab === 'all') {
          cards.push({ sp, projectName: p.name, projectId: p.id });
        }
      }
    }
    cards.sort((a, b) => (b.sp.active_count + b.sp.problem_count) - (a.sp.active_count + a.sp.problem_count));
    return cards;
  };

  const STATUS_ICONS: Record<string, string> = {
    idea: '\u{1F4A1}', writing: '\u{270F}\u{FE0F}', submitted: '\u{1F680}',
    testing: '\u{1F9EA}', done: '\u{2705}', problem: '\u{1F534}',
  };

  // ── 전체 요약 집계 ──
  const summary = (() => {
    let total = 0, active = 0, pending = 0, done = 0, problem = 0;
    for (const p of projects) {
      for (const sp of p.subProjects) {
        total += sp.task_count;
        active += sp.active_count;
        pending += sp.pending_count;
        done += sp.done_count;
        problem += sp.problem_count;
      }
    }
    return { total, active, pending, done, problem, today: todayTasks.length };
  })();

  const summaryItems = [
    { label: 'Total', value: summary.total, color: 'text-foreground', bg: 'bg-foreground/5', filter: 'total' },
    { label: 'Active', value: summary.active, color: 'text-cyan-400', bg: 'bg-cyan-400/10', filter: 'active' },
    { label: 'Pending', value: summary.pending, color: 'text-indigo-400', bg: 'bg-indigo-400/10', filter: 'pending' },
    { label: 'Done', value: summary.done, color: 'text-emerald-400', bg: 'bg-emerald-400/10', filter: 'done' },
    { label: 'Problem', value: summary.problem, color: 'text-red-400', bg: 'bg-red-400/10', filter: 'problem' },
    { label: 'Today', value: summary.today, color: 'text-amber-400', bg: 'bg-amber-400/10', filter: 'today' },
  ];

  const STATUS_FILTERS: Record<string, (t: ITask) => boolean> = {
    total: () => true,
    active: (t) => t.status === 'submitted' || t.status === 'testing',
    pending: (t) => t.status === 'idea' || t.status === 'writing',
    done: (t) => t.status === 'done',
    problem: (t) => t.status === 'problem',
    today: (t) => t.is_today,
  };

  const filteredTasks = statusFilter
    ? allTasks.filter(STATUS_FILTERS[statusFilter] || (() => true))
    : [];

  return (
    <div className="h-full overflow-y-auto p-8 w-full max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            IM <span className="text-muted-foreground font-normal text-sm ml-2">Idea Manager v2</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <DashboardTabBar value={tab} onChange={handleTabChange} />
          <button
            onClick={openSyncModal}
            className="px-3 py-2 text-sm border rounded-lg transition-colors bg-muted hover:bg-card-hover text-muted-foreground border-border"
            title="DB Sync via Git"
          >
            Sync
          </button>
          <button
            onClick={toggleMemo}
            className={`px-3 py-2 text-sm border rounded-lg transition-colors ${
              memoOpen
                ? 'bg-accent/15 text-accent border-accent/30 hover:bg-accent/25'
                : 'bg-muted hover:bg-card-hover text-muted-foreground border-border'
            }`}
            title="Quick memo"
          >
            Memo
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg
                       transition-colors font-medium text-sm"
          >
            + Workspace
          </button>
        </div>
      </header>

      {/* 상태 요약 바 */}
      {!loading && summary.total > 0 && (
        <div className="mb-6">
          <div className="grid grid-cols-6 gap-2">
            {summaryItems.map(({ label, value, color, bg, filter }) => (
              <button
                key={label}
                onClick={() => setStatusFilter(statusFilter === filter ? null : filter)}
                className={`${bg} rounded-lg p-3 text-center transition-all hover:scale-[1.02] hover:brightness-110 cursor-pointer
                  ${statusFilter === filter ? 'ring-2 ring-offset-1 ring-offset-transparent ring-current scale-[1.02]' : ''}`}
              >
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</div>
              </button>
            ))}
          </div>
          {summary.total > 0 && (
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden flex">
              {summary.done > 0 && <div className="bg-emerald-400 transition-all" style={{ width: `${(summary.done / summary.total) * 100}%` }} />}
              {summary.active > 0 && <div className="bg-cyan-400 transition-all" style={{ width: `${(summary.active / summary.total) * 100}%` }} />}
              {summary.pending > 0 && <div className="bg-indigo-400 transition-all" style={{ width: `${(summary.pending / summary.total) * 100}%` }} />}
              {summary.problem > 0 && <div className="bg-red-400 transition-all" style={{ width: `${(summary.problem / summary.total) * 100}%` }} />}
            </div>
          )}
          {statusFilter && (
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {summaryItems.find(s => s.filter === statusFilter)?.label} — {filteredTasks.length} tasks
                </span>
                <button onClick={() => setStatusFilter(null)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>
              </div>
              <div className="max-h-[280px] overflow-y-auto space-y-1">
                {filteredTasks.map((task) => (
                  <div key={task.id}
                    onClick={() => openProject(task.project_id, task.projectName, task.sub_project_id, task.id)}
                    className="flex items-center gap-3 px-3 py-2 bg-card hover:bg-card-hover border border-border rounded-lg cursor-pointer transition-colors">
                    <span className="text-sm">{STATUS_ICONS[task.status]}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{task.title}</span>
                      <span className="text-xs text-muted-foreground ml-2">{task.projectName} / {task.subProjectName}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {memoOpen && (
        <div className="mb-6 bg-card rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick Memo</span>
            <span className="text-[10px] text-muted-foreground">auto-saved</span>
          </div>
          <textarea
            value={memoContent}
            onChange={(e) => handleMemoChange(e.target.value)}
            placeholder="자유롭게 메모하세요..."
            className="w-full bg-transparent px-4 py-3 text-sm text-foreground resize-none
                       focus:outline-none leading-relaxed font-mono min-h-[150px] max-h-[400px]"
            style={{ height: Math.max(150, Math.min(400, (memoContent.split('\n').length + 1) * 22)) }}
          />
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 p-5 bg-card rounded-lg border border-border">
          <input type="text" placeholder="Workspace name" value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-input border border-border rounded-lg px-4 py-2.5 mb-3 focus:border-primary focus:outline-none text-foreground"
            autoFocus />
          <input type="text" placeholder="Description (optional)" value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full bg-input border border-border rounded-lg px-4 py-2.5 mb-3 focus:border-primary focus:outline-none text-foreground" />
          <div className="mb-4">
            <button type="button" onClick={() => setShowDirPicker(true)}
              className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-left text-sm hover:border-primary transition-colors">
              {projectPath ? <span className="font-mono text-foreground">{projectPath}</span>
                : <span className="text-muted-foreground">Workspace folder (optional)</span>}
            </button>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors text-sm">Cancel</button>
            <button type="submit"
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors text-sm">Create</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center text-muted-foreground py-20">Loading...</div>
      ) : tab === 'archive' ? (
        archivedTasks.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg mb-2">No archived tasks</p>
            <p className="text-sm">Archived tasks will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {archivedTasks.map((task) => (
              <div key={task.id}
                className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg transition-colors group">
                <span className="text-sm">{STATUS_ICONS[task.status]}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{task.title}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {task.projectName}{task.subProjectName ? ` / ${task.subProjectName}` : ''}
                  </span>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={async () => {
                      await fetch('/api/archive', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ taskId: task.id, action: 'restore' }),
                      });
                      loadArchive();
                      fetchData();
                    }}
                    className="px-2 py-1 text-xs text-primary hover:bg-primary/10 rounded transition-colors"
                  >
                    Restore
                  </button>
                  <button
                    onClick={async () => {
                      await fetch('/api/archive', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ taskId: task.id, action: 'delete' }),
                      });
                      loadArchive();
                    }}
                    className="px-2 py-1 text-xs text-destructive hover:bg-destructive/10 rounded transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === 'today' ? (
        todayTasks.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg mb-2">No tasks marked for today</p>
            <p className="text-sm">Mark tasks with the Today button in task detail</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todayTasks.map((task) => (
              <div key={task.id}
                onClick={() => openProject(task.project_id, task.projectName, task.sub_project_id, task.id)}
                className="flex items-center gap-3 p-3 bg-card hover:bg-card-hover border border-border rounded-lg cursor-pointer transition-colors">
                <span className="text-sm">{STATUS_ICONS[task.status]}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{task.title}</span>
                  <span className="text-xs text-muted-foreground ml-2">{task.projectName} / {task.subProjectName}</span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          {tab === 'all' ? (
            projects.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-muted-foreground text-lg mb-2">No workspaces yet</p>
                <p className="text-muted-foreground text-sm">Click + Workspace to get started</p>
              </div>
            ) : (
              <div className="space-y-6">
                {projects.map((project) => (
                  <div key={project.id}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"
                        onClick={() => openProject(project.id, project.name)}>
                        <h2 className="text-sm font-semibold">{project.name}</h2>
                        {project.project_path && (
                          <span className="text-xs text-muted-foreground font-mono truncate max-w-48">{project.project_path}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={(e) => handleEditClick(project, e)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors">Edit</button>
                        <button onClick={(e) => handleDeleteClick(project.id, e)}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors">Delete</button>
                      </div>
                    </div>
                    {project.subProjects.length === 0 ? (
                      <div className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
                        No projects.{' '}
                        <span className="text-primary cursor-pointer hover:underline"
                          onClick={() => openProject(project.id, project.name)}>Open workspace</span>{' '}to add one.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {project.subProjects.map((sp) => (
                          <SubProjectCard key={sp.id} subProject={sp} projectName={project.name}
                            onClick={() => openProject(project.id, project.name, sp.id)} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            (() => {
              const cards = getVisibleCards();
              return cards.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                  <p className="text-lg mb-2">No active tasks</p>
                  <p className="text-sm">Submit tasks to see them here</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {cards.map(({ sp, projectName, projectId }) => (
                    <SubProjectCard key={sp.id} subProject={sp} projectName={projectName}
                      onClick={() => {
                        const proj = projects.find(p => p.id === projectId);
                        openProject(projectId, proj?.name || projectName, sp.id);
                      }} />
                  ))}
                </div>
              );
            })()
          )}
        </>
      )}

      {showDirPicker && (
        <DirectoryPicker onSelect={(path) => { setProjectPath(path); setShowDirPicker(false); }}
          onCancel={() => setShowDirPicker(false)} />
      )}

      {showSync && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSync(false)} />
          <div className="relative bg-card border border-border rounded-xl shadow-2xl w-[480px] animate-dialog-in">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">DB Sync</h3>
              <button onClick={() => setShowSync(false)} className="text-muted-foreground hover:text-foreground text-lg px-1">x</button>
            </div>
            <div className="p-5 space-y-4">
              {syncStatus === null ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : !syncStatus.initialized ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Git 저장소 URL을 입력하세요.</p>
                  <input
                    value={syncRepoUrl}
                    onChange={(e) => setSyncRepoUrl(e.target.value)}
                    placeholder="https://github.com/user/repo.git"
                    className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm focus:border-primary focus:outline-none text-foreground"
                  />
                  <button
                    onClick={() => handleSyncAction('init')}
                    disabled={syncLoading || !syncRepoUrl.trim()}
                    className="w-full px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
                  >
                    {syncLoading ? 'Initializing...' : 'Initialize'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs space-y-1">
                    <p><span className="text-muted-foreground">Remote:</span> <span className="font-mono">{syncStatus.remoteUrl || 'none'}</span></p>
                    <p><span className="text-muted-foreground">Last sync:</span> {syncStatus.lastCommit || 'never'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSyncAction('push')}
                      disabled={syncLoading}
                      className="flex-1 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
                    >
                      {syncLoading ? '...' : 'Push'}
                    </button>
                    <button
                      onClick={() => handleSyncAction('pull')}
                      disabled={syncLoading}
                      className="flex-1 px-4 py-2 text-sm bg-muted text-foreground border border-border rounded-lg hover:bg-card-hover transition-colors disabled:opacity-50"
                    >
                      {syncLoading ? '...' : 'Pull'}
                    </button>
                  </div>
                </div>
              )}
              {syncMessage && (
                <p className={`text-xs ${syncMessage.startsWith('Error') ? 'text-destructive' : 'text-success'}`}>
                  {syncMessage}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Workspace Edit Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditTarget(null)} />
          <div className="relative bg-card border border-border rounded-xl shadow-2xl w-[480px] animate-dialog-in">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">Edit Workspace</h3>
              <button onClick={() => setEditTarget(null)} className="text-muted-foreground hover:text-foreground text-lg px-1">x</button>
            </div>
            <div className="p-5 space-y-3">
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                placeholder="Workspace name"
                className="w-full bg-input border border-border rounded-lg px-4 py-2.5 focus:border-primary focus:outline-none text-foreground"
                autoFocus />
              <input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full bg-input border border-border rounded-lg px-4 py-2.5 focus:border-primary focus:outline-none text-foreground" />
              <button type="button" onClick={() => setShowEditDirPicker(true)}
                className="w-full bg-input border border-border rounded-lg px-4 py-2.5 text-left text-sm hover:border-primary transition-colors">
                {editPath ? <span className="font-mono text-foreground">{editPath}</span>
                  : <span className="text-muted-foreground">Workspace folder (optional)</span>}
              </button>
              {editPath && (
                <button type="button" onClick={() => setEditPath('')}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                  Clear folder link
                </button>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
              <button onClick={() => setEditTarget(null)}
                className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors text-sm">Cancel</button>
              <button onClick={handleEditSave} disabled={!editName.trim()}
                className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors text-sm disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}

      {showEditDirPicker && (
        <DirectoryPicker onSelect={(path) => { setEditPath(path); setShowEditDirPicker(false); }}
          onCancel={() => setShowEditDirPicker(false)} initialPath={editPath || undefined} />
      )}

      <ConfirmDialog open={!!deleteTarget} title="Delete workspace?"
        description="This will permanently delete the workspace and all its data."
        confirmLabel="Delete" variant="danger"
        onConfirm={handleDeleteConfirm} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}
