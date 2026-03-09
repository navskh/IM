'use client';

import { useState, useEffect, useCallback } from 'react';
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
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [showDirPicker, setShowDirPicker] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [tab, setTab] = useState<DashboardTab>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('im-dashboard-tab') as DashboardTab) || 'active';
    }
    return 'active';
  });

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

    // Gather today tasks
    const allToday: (ITask & { projectName: string; subProjectName: string })[] = [];
    for (const p of withSubs) {
      for (const sp of p.subProjects) {
        if (sp.task_count > 0) {
          const tasksRes = await fetch(`/api/projects/${p.id}/sub-projects/${sp.id}/tasks`);
          const tasks: ITask[] = await tasksRes.json();
          for (const t of tasks) {
            if (t.is_today) {
              allToday.push({ ...t, projectName: p.name, subProjectName: sp.name });
            }
          }
        }
      }
    }
    setTodayTasks(allToday);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh when tab becomes visible
  useEffect(() => {
    if (isVisible && !loading) fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  const handleTabChange = (newTab: DashboardTab) => {
    setTab(newTab);
    localStorage.setItem('im-dashboard-tab', newTab);
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

  return (
    <div className="h-full overflow-y-auto p-8 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            IM <span className="text-muted-foreground font-normal text-sm ml-2">Idea Manager v2</span>
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <DashboardTabBar value={tab} onChange={handleTabChange} />
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg
                       transition-colors font-medium text-sm"
          >
            + Project
          </button>
        </div>
      </header>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 p-5 bg-card rounded-lg border border-border">
          <input type="text" placeholder="Project name" value={name}
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
                : <span className="text-muted-foreground">Project folder (optional)</span>}
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
                <p className="text-muted-foreground text-lg mb-2">No projects yet</p>
                <p className="text-muted-foreground text-sm">Click + Project to get started</p>
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
                      <button onClick={(e) => handleDeleteClick(project.id, e)}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors">Delete</button>
                    </div>
                    {project.subProjects.length === 0 ? (
                      <div className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
                        No sub-projects.{' '}
                        <span className="text-primary cursor-pointer hover:underline"
                          onClick={() => openProject(project.id, project.name)}>Open project</span>{' '}to add one.
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

      <ConfirmDialog open={!!deleteTarget} title="Delete project?"
        description="This will permanently delete the project and all its data."
        confirmLabel="Delete" variant="danger"
        onConfirm={handleDeleteConfirm} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}
