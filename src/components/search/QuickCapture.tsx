'use client';

import { useEffect, useRef, useState } from 'react';
import { useTabContext } from '@/components/tabs/TabContext';
import type { IProject, ISubProject, ITask } from '@/types';

interface ProjectWithSubs extends IProject {
  subProjects?: ISubProject[];
  loaded?: boolean;
}

const LAST_DEST_KEY = 'im-quick-capture-last-dest';

interface LastDest { projectId: string; subProjectId: string }

function loadLastDest(): LastDest | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LAST_DEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.projectId && parsed?.subProjectId) return parsed as LastDest;
  } catch { /* ignore */ }
  return null;
}

function saveLastDest(dest: LastDest) {
  try { localStorage.setItem(LAST_DEST_KEY, JSON.stringify(dest)); } catch { /* quota */ }
}

export default function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectWithSubs[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [subProjectId, setSubProjectId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const { openProject } = useTabContext();

  // Global ⌘N / Ctrl+N shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Load projects on first open
  useEffect(() => {
    if (!open) return;
    fetch('/api/projects')
      .then(r => r.ok ? r.json() : [])
      .then((data: IProject[]) => {
        setProjects(data.map(p => ({ ...p })));
        const last = loadLastDest();
        const fallback = data[0]?.id;
        const initial = last?.projectId && data.some(p => p.id === last.projectId) ? last.projectId : fallback;
        if (initial) setProjectId(initial);
      });
  }, [open]);

  // Load sub-projects when project changes
  useEffect(() => {
    if (!projectId) { setSubProjectId(''); return; }
    const existing = projects.find(p => p.id === projectId);
    if (existing?.loaded && existing.subProjects) {
      const last = loadLastDest();
      const fallback = existing.subProjects[0]?.id ?? '';
      setSubProjectId(
        last?.projectId === projectId && existing.subProjects.some(s => s.id === last.subProjectId)
          ? last.subProjectId
          : fallback,
      );
      return;
    }
    fetch(`/api/projects/${projectId}/sub-projects`)
      .then(r => r.ok ? r.json() : [])
      .then((subs: ISubProject[]) => {
        setProjects(prev => prev.map(p =>
          p.id === projectId ? { ...p, subProjects: subs, loaded: true } : p
        ));
        const last = loadLastDest();
        const fallback = subs[0]?.id ?? '';
        setSubProjectId(
          last?.projectId === projectId && subs.some(s => s.id === last.subProjectId)
            ? last.subProjectId
            : fallback,
        );
      });
  // projects is mutated above; keep deps minimal to avoid refetch loops
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setErr(null);
    setBusy(false);
    const id = requestAnimationFrame(() => titleRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const submit = async () => {
    const t = title.trim();
    if (!t || !projectId || !subProjectId || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/sub-projects/${subProjectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const task = await res.json() as ITask;
      saveLastDest({ projectId, subProjectId });
      const project = projects.find(p => p.id === projectId);
      if (project) openProject(project.id, project.name, subProjectId, task.id);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '생성 실패');
      setBusy(false);
    }
  };

  if (!open) return null;

  const currentProject = projects.find(p => p.id === projectId);
  const subs = currentProject?.subProjects ?? [];

  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[16vh]"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md animate-dialog-in p-4 flex flex-col gap-3"
      >
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">빠른 태스크 캡처</div>
          <span className="text-[10px] text-muted-foreground/70 px-1.5 py-0.5 border border-border rounded">⌘N · Esc</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="bg-input border border-border rounded-md px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={subProjectId}
            onChange={(e) => setSubProjectId(e.target.value)}
            disabled={!subs.length}
            className="bg-input border border-border rounded-md px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
          >
            {subs.length === 0 ? (
              <option value="">프로젝트 없음</option>
            ) : subs.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
            if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
          }}
          placeholder="태스크 제목을 입력하고 Enter…"
          className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
        />

        {err && <div className="text-xs text-destructive">⚠ {err}</div>}

        <div className="flex items-center justify-between">
          <div className="text-[10px] text-muted-foreground/70">
            저장 후 해당 태스크 워크스페이스로 바로 이동
          </div>
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground px-2 py-1">취소</button>
            <button
              onClick={submit}
              disabled={!title.trim() || !projectId || !subProjectId || busy}
              className="text-xs px-3 py-1 bg-primary text-primary-foreground rounded disabled:opacity-40"
            >
              {busy ? '…' : '생성'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
