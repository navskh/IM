'use client';

import { useState, useEffect } from 'react';
import { useAiActivity } from '@/hooks/useAiActivity';
import { mod } from '@/lib/platform';

function elapsed(startedAt: number): string {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
}

function typeLabel(t: string): string {
  switch (t) {
    case 'refine': return `${mod()}K Refine`;
    case 'task-chat': return 'Note Assistant';
    case 'project-advisor': return 'Project Advisor';
    case 'global-advisor': return 'Global Advisor';
    case 'watch': return 'Watch';
    default: return t;
  }
}

export default function AiActivityIndicator() {
  const activities = useAiActivity();
  const [, tick] = useState(0);
  const [showList, setShowList] = useState(false);

  // Re-render every second to update elapsed times
  useEffect(() => {
    if (activities.length === 0) return;
    const id = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [activities.length]);

  if (activities.length === 0) return null;

  return (
    <div className="relative mr-2">
      <button
        onClick={() => setShowList(prev => !prev)}
        className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border border-warning/40 bg-warning/15 text-warning hover:bg-warning/25 transition-colors"
        title={`AI 작업 ${activities.length}개 진행 중`}
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
        <span>AI {activities.length}</span>
      </button>

      {showList && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setShowList(false)} />
          <div className="absolute right-0 top-full mt-1 z-[81] bg-card border border-border rounded-lg shadow-xl w-72 py-1 animate-dialog-in">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 border-b border-border">
              진행 중인 AI 작업
            </div>
            {activities.map(a => (
              <div key={a.id} className="px-3 py-2 flex items-center gap-2 text-xs">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-warning animate-pulse flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-foreground truncate">{a.label}</div>
                  <div className="text-muted-foreground/70">{typeLabel(a.type)}</div>
                </div>
                <span className="text-muted-foreground font-mono flex-shrink-0">{elapsed(a.startedAt)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
