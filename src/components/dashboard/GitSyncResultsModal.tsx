'use client';

import { useEffect, useRef } from 'react';
import type { IGitSyncResult } from '@/types';

const STATUS_STYLE: Record<IGitSyncResult['status'], { icon: string; color: string }> = {
  success: { icon: '\u2705', color: 'text-success' },
  error: { icon: '\u274C', color: 'text-destructive' },
  'no-git': { icon: '\u2796', color: 'text-muted-foreground' },
  'no-path': { icon: '\u2796', color: 'text-muted-foreground' },
};

export default function GitSyncResultsModal({
  open,
  results,
  onClose,
}: {
  open: boolean;
  results: IGitSyncResult[];
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const successCount = results.filter(r => r.status === 'success').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const skipCount = results.filter(r => r.status === 'no-git' || r.status === 'no-path').length;

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
    >
      <div className="bg-card border border-border rounded-xl shadow-2xl shadow-black/40
                      w-full max-w-md mx-4 animate-dialog-in">
        <div className="p-5 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Git Sync Results</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {successCount} synced, {errorCount} failed, {skipCount} skipped
          </p>
        </div>

        <div className="max-h-64 overflow-y-auto p-3 space-y-1.5">
          {results.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No projects with linked folders
            </p>
          ) : (
            results.map((r) => {
              const style = STATUS_STYLE[r.status];
              return (
                <div key={r.projectId} className="flex items-start gap-2 p-2 rounded-lg bg-muted/50">
                  <span className="text-sm flex-shrink-0">{style.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{r.projectName}</div>
                    <div className={`text-xs ${style.color} truncate`} title={r.message}>
                      {r.message}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-end px-5 pb-4 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground
                       bg-muted hover:bg-card-hover border border-border rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
