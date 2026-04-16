'use client';

import { useState, useCallback } from 'react';
import type { AdvisorAction, CreateTaskAction, UpdateTaskAction } from '@/types/advisor-actions';

function CreateRow({ action }: { action: CreateTaskAction }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-success text-xs font-bold">+</span>
      <span className="text-xs text-foreground truncate flex-1">{action.title}</span>
      {action.priority && action.priority !== 'medium' && (
        <span className={`text-[10px] px-1 rounded ${action.priority === 'high' ? 'bg-destructive/20 text-destructive' : 'bg-muted text-muted-foreground'}`}>
          {action.priority}
        </span>
      )}
    </div>
  );
}

function UpdateRow({ action }: { action: UpdateTaskAction }) {
  const changes = Object.entries(action.changes)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  return (
    <div className="flex items-center gap-2">
      <span className="text-warning text-xs font-bold">~</span>
      <span className="text-xs text-muted-foreground truncate">task:{action.taskId.slice(0, 8)}</span>
      <span className="text-xs text-foreground truncate flex-1">→ {changes}</span>
    </div>
  );
}

export default function ActionBlock({
  actions,
  onApplied,
}: {
  actions: AdvisorAction[];
  onApplied?: () => void;
}) {
  const [status, setStatus] = useState<'pending' | 'applying' | 'applied' | 'error'>('pending');
  const [error, setError] = useState<string | null>(null);
  const [resultSummary, setResultSummary] = useState<string | null>(null);

  const apply = useCallback(async () => {
    setStatus('applying');
    setError(null);
    try {
      const res = await fetch('/api/advisor-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const results = data.results as { index: number; success: boolean; error?: string }[];
      const ok = results.filter(r => r.success).length;
      const fail = results.filter(r => !r.success).length;
      if (fail > 0) {
        setResultSummary(`${ok} 성공, ${fail} 실패`);
        setStatus(ok > 0 ? 'applied' : 'error');
      } else {
        setResultSummary(`${ok}개 적용 완료`);
        setStatus('applied');
      }
      onApplied?.();
      window.dispatchEvent(new Event('advisor-action-applied'));
    } catch (err) {
      setError(err instanceof Error ? err.message : '적용 실패');
      setStatus('error');
    }
  }, [actions, onApplied]);

  const createCount = actions.filter(a => a.type === 'create_task').length;
  const updateCount = actions.filter(a => a.type === 'update_task').length;

  return (
    <div className={`my-2 border rounded-lg text-xs ${
      status === 'applied' ? 'border-success/30 bg-success/5' :
      status === 'error' ? 'border-destructive/30 bg-destructive/5' :
      'border-border bg-card'
    }`}>
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>Proposed Actions</span>
          {createCount > 0 && <span className="text-success">+{createCount} create</span>}
          {updateCount > 0 && <span className="text-warning">~{updateCount} update</span>}
        </div>
        {status === 'applied' && <span className="text-success">✓ {resultSummary}</span>}
        {status === 'error' && <span className="text-destructive">⚠ {error || resultSummary}</span>}
      </div>
      <div className="px-3 py-2 space-y-1.5 max-h-[200px] overflow-y-auto">
        {actions.map((a, i) => (
          <div key={i}>
            {a.type === 'create_task' ? <CreateRow action={a} /> : <UpdateRow action={a} />}
          </div>
        ))}
      </div>
      {status !== 'applied' && (
        <div className="px-3 py-2 border-t border-border flex justify-end gap-2">
          {status === 'error' && (
            <button onClick={apply} className="px-2 py-1 text-foreground hover:text-primary transition-colors">
              재시도
            </button>
          )}
          {status === 'pending' && (
            <button
              onClick={apply}
              className="px-3 py-1 bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
            >
              적용
            </button>
          )}
          {status === 'applying' && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
              적용 중…
            </span>
          )}
        </div>
      )}
    </div>
  );
}
