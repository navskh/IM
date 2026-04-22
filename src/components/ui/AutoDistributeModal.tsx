'use client';

import { useState, useEffect } from 'react';
import type { ItemPriority } from '@/types';

interface DistTask {
  title: string;
  description: string;
  priority: ItemPriority;
}

interface Distribution {
  sub_project_name: string;
  is_new: boolean;
  existing_sub_id: string | null;
  tasks: DistTask[];
}

interface AutoDistributeModalProps {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onApplied: (result: { historyId: string | null }) => void;
}

export default function AutoDistributeModal({
  open,
  projectId,
  onClose,
  onApplied,
}: AutoDistributeModalProps) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [collapsedSubs, setCollapsedSubs] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    setDistributions([]);
    setError(null);
    setCollapsedSubs(new Set());
    fetchDistribution();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const fetchDistribution = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/auto-distribute`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        const rawInfo = data.raw ? `\n\nAI 응답:\n${data.raw}` : '';
        setError((data.error || 'Failed to get distribution') + rawInfo);
        return;
      }
      setDistributions(data.distributions || []);
    } catch {
      setError('AI 호출에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    const nonEmpty = distributions.filter(d => d.tasks.length > 0);
    if (nonEmpty.length === 0) return;

    setApplying(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/apply-distribute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distributions: nonEmpty }),
      });
      if (res.ok) {
        const data = await res.json();
        onApplied({ historyId: data.historyId ?? null });
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to apply');
      }
    } catch {
      setError('적용에 실패했습니다.');
    } finally {
      setApplying(false);
    }
  };

  // Edit handlers
  const updateTaskTitle = (distIdx: number, taskIdx: number, title: string) => {
    setDistributions(prev => prev.map((d, di) =>
      di === distIdx ? { ...d, tasks: d.tasks.map((t, ti) => ti === taskIdx ? { ...t, title } : t) } : d
    ));
  };

  const updateTaskPriority = (distIdx: number, taskIdx: number, priority: ItemPriority) => {
    setDistributions(prev => prev.map((d, di) =>
      di === distIdx ? { ...d, tasks: d.tasks.map((t, ti) => ti === taskIdx ? { ...t, priority } : t) } : d
    ));
  };

  const removeTask = (distIdx: number, taskIdx: number) => {
    setDistributions(prev => prev.map((d, di) =>
      di === distIdx ? { ...d, tasks: d.tasks.filter((_, ti) => ti !== taskIdx) } : d
    ));
  };

  const updateSubName = (distIdx: number, name: string) => {
    setDistributions(prev => prev.map((d, di) =>
      di === distIdx ? { ...d, sub_project_name: name } : d
    ));
  };

  const removeDistribution = (distIdx: number) => {
    setDistributions(prev => prev.filter((_, i) => i !== distIdx));
  };

  const toggleCollapse = (idx: number) => {
    setCollapsedSubs(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const moveTask = (fromDist: number, taskIdx: number, toDist: number) => {
    setDistributions(prev => {
      const task = prev[fromDist].tasks[taskIdx];
      return prev.map((d, di) => {
        if (di === fromDist) return { ...d, tasks: d.tasks.filter((_, ti) => ti !== taskIdx) };
        if (di === toDist) return { ...d, tasks: [...d.tasks, task] };
        return d;
      });
    });
  };

  const totalTasks = distributions.reduce((sum, d) => sum + d.tasks.length, 0);

  if (!open) return null;

  const priorityDot = (p: ItemPriority) => {
    const colors = { high: 'bg-danger', medium: 'bg-warning', low: 'bg-muted-foreground/40' };
    return <span className={`inline-block w-2 h-2 rounded-full ${colors[p]}`} />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-[720px] max-h-[85vh] flex flex-col animate-dialog-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold">Auto Distribute</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI가 브레인스토밍을 분석하여 태스크를 분배합니다
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg px-1">x</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">AI가 분석 중...</p>
            </div>
          )}

          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg p-3 mb-3">
              <pre className="text-xs text-danger whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">{error}</pre>
              <button onClick={fetchDistribution} className="text-xs text-accent hover:underline mt-1">
                다시 시도
              </button>
            </div>
          )}

          {!loading && distributions.length > 0 && (
            <div className="space-y-3">
              {distributions.map((dist, distIdx) => (
                <div key={distIdx} className="border border-border rounded-lg overflow-hidden">
                  {/* Sub-project header */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/50">
                    <button
                      onClick={() => toggleCollapse(distIdx)}
                      className="text-xs text-muted-foreground hover:text-foreground w-4"
                    >
                      {collapsedSubs.has(distIdx) ? '\u25B6' : '\u25BC'}
                    </button>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      dist.is_new
                        ? 'bg-success/15 text-success'
                        : 'bg-accent/15 text-accent'
                    }`}>
                      {dist.is_new ? 'NEW' : 'EXISTING'}
                    </span>
                    <input
                      value={dist.sub_project_name}
                      onChange={(e) => updateSubName(distIdx, e.target.value)}
                      className="flex-1 bg-transparent text-sm font-medium text-foreground focus:outline-none border-b border-transparent focus:border-primary"
                    />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {dist.tasks.length}
                    </span>
                    <button
                      onClick={() => removeDistribution(distIdx)}
                      className="text-xs text-muted-foreground hover:text-danger px-1"
                      title="Remove group"
                    >
                      x
                    </button>
                  </div>

                  {/* Tasks */}
                  {!collapsedSubs.has(distIdx) && (
                    <div className="divide-y divide-border">
                      {dist.tasks.map((task, taskIdx) => (
                        <div key={taskIdx} className="flex items-center gap-2 px-3 py-1.5 group hover:bg-muted/30">
                          {priorityDot(task.priority)}
                          <input
                            value={task.title}
                            onChange={(e) => updateTaskTitle(distIdx, taskIdx, e.target.value)}
                            className="flex-1 bg-transparent text-xs text-foreground focus:outline-none border-b border-transparent focus:border-primary"
                          />
                          <select
                            value={task.priority}
                            onChange={(e) => updateTaskPriority(distIdx, taskIdx, e.target.value as ItemPriority)}
                            className="text-[10px] bg-transparent text-muted-foreground cursor-pointer hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <option value="high">high</option>
                            <option value="medium">medium</option>
                            <option value="low">low</option>
                          </select>
                          {distributions.length > 1 && (
                            <select
                              value=""
                              onChange={(e) => {
                                const target = parseInt(e.target.value);
                                if (!isNaN(target)) moveTask(distIdx, taskIdx, target);
                              }}
                              className="text-[10px] bg-transparent text-muted-foreground cursor-pointer hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Move to..."
                            >
                              <option value="">Move</option>
                              {distributions.map((d, di) =>
                                di !== distIdx && (
                                  <option key={di} value={di}>{d.sub_project_name}</option>
                                )
                              )}
                            </select>
                          )}
                          <button
                            onClick={() => removeTask(distIdx, taskIdx)}
                            className="text-xs text-muted-foreground hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity px-0.5"
                          >
                            x
                          </button>
                        </div>
                      ))}
                      {dist.tasks.length === 0 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground italic">
                          No tasks (this group will be skipped)
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && !error && distributions.length === 0 && (
            <div className="text-center py-16 text-sm text-muted-foreground">
              No distribution available
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {distributions.length > 0 && `${distributions.length} projects, ${totalTasks} tasks`}
          </span>
          <div className="flex items-center gap-2">
            {!loading && distributions.length > 0 && (
              <button
                onClick={fetchDistribution}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
              >
                Retry
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={applying || loading || totalTasks === 0}
              className="px-4 py-1.5 text-xs bg-primary text-white rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {applying ? 'Applying...' : `Apply (${totalTasks})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
