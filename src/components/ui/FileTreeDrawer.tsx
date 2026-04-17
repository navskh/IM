'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface TreeEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  extension?: string;
}

interface DirNode {
  entries: TreeEntry[];
  loaded: boolean;
  loading: boolean;
  error?: string;
}

const FILE_ICONS: Record<string, string> = {
  ts: 'TS', tsx: 'TX', js: 'JS', jsx: 'JX',
  json: '{}', md: 'MD', css: 'CS', scss: 'SC',
  html: 'HT', svg: 'SV', png: 'PN', jpg: 'JP',
  py: 'PY', go: 'GO', rs: 'RS', java: 'JA',
  sql: 'SQ', sh: 'SH', yml: 'YM', yaml: 'YM',
  toml: 'TM', xml: 'XM', txt: 'TX', env: 'EN',
  lock: 'LK', gitignore: 'GI',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

function getFileIcon(ext?: string): string {
  if (!ext) return '--';
  return FILE_ICONS[ext] || ext.slice(0, 2).toUpperCase();
}

export default function FileTreeDrawer({
  rootPath,
  onClose,
}: {
  rootPath: string;
  onClose: () => void;
}) {
  const [dirs, setDirs] = useState<Record<string, DirNode>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set([rootPath]));
  const overlayRef = useRef<HTMLDivElement>(null);

  const loadDir = useCallback(async (dirPath: string) => {
    setDirs(prev => ({
      ...prev,
      [dirPath]: { entries: [], loaded: false, loading: true },
    }));

    try {
      const res = await fetch(`/api/filesystem/tree?path=${encodeURIComponent(dirPath)}`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setDirs(prev => ({
        ...prev,
        [dirPath]: { entries: data.entries, loaded: true, loading: false },
      }));
    } catch {
      setDirs(prev => ({
        ...prev,
        [dirPath]: { entries: [], loaded: true, loading: false, error: 'Failed to load' },
      }));
    }
  }, []);

  // Load root on mount
  useEffect(() => {
    loadDir(rootPath);
  }, [rootPath, loadDir]);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const toggleDir = (dirPath: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
        // Load if not yet loaded
        if (!dirs[dirPath]?.loaded && !dirs[dirPath]?.loading) {
          loadDir(dirPath);
        }
      }
      return next;
    });
  };

  const renderEntries = (dirPath: string, depth: number) => {
    const node = dirs[dirPath];
    if (!node) return null;

    if (node.loading) {
      return (
        <div className="flex items-center gap-2 py-1" style={{ paddingLeft: depth * 16 + 12 }}>
          <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
        </div>
      );
    }

    if (node.error) {
      return (
        <div className="flex items-center gap-2 py-1" style={{ paddingLeft: depth * 16 + 12 }}>
          <span className="text-xs text-destructive">{node.error}</span>
        </div>
      );
    }

    if (node.entries.length === 0) {
      return (
        <div className="flex items-center gap-2 py-1" style={{ paddingLeft: depth * 16 + 12 }}>
          <span className="text-xs text-muted-foreground italic">Empty</span>
        </div>
      );
    }

    return node.entries.map((entry) => {
      const isDir = entry.type === 'directory';
      const isExpanded = expanded.has(entry.path);

      return (
        <div key={entry.path}>
          <div
            className={`flex items-center gap-1.5 py-[3px] pr-3 cursor-pointer transition-colors hover:bg-card-hover group ${
              isDir ? 'text-foreground' : 'text-muted-foreground'
            }`}
            style={{ paddingLeft: depth * 16 + 12 }}
            onClick={() => isDir && toggleDir(entry.path)}
          >
            {isDir ? (
              <>
                <span className="w-4 text-center text-xs text-muted-foreground flex-shrink-0">
                  {isExpanded ? '\u25BC' : '\u25B6'}
                </span>
                <span className="text-sm flex-shrink-0">
                  {isExpanded ? '\uD83D\uDCC2' : '\uD83D\uDCC1'}
                </span>
                <span className="text-sm truncate flex-1 font-medium">{entry.name}</span>
              </>
            ) : (
              <>
                <span className="w-4 flex-shrink-0" />
                <span className="text-[10px] font-mono w-5 text-center flex-shrink-0 text-muted-foreground/70">
                  {getFileIcon(entry.extension)}
                </span>
                <span className="text-sm truncate flex-1">{entry.name}</span>
                {entry.size !== undefined && (
                  <span className="text-[10px] text-muted-foreground/50 tabular-nums flex-shrink-0">
                    {formatSize(entry.size)}
                  </span>
                )}
              </>
            )}
          </div>
          {isDir && isExpanded && renderEntries(entry.path, depth + 1)}
        </div>
      );
    });
  };

  const dirName = rootPath.split(/[\\/]/).filter(Boolean).pop() || rootPath;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex justify-end"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

      {/* Drawer */}
      <div className="relative w-[420px] max-w-[85vw] h-full bg-card border-l border-border shadow-2xl flex flex-col animate-drawer-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base">{'\uD83D\uDCC2'}</span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold truncate">{dirName}</h2>
              <p className="text-[10px] text-muted-foreground font-mono truncate">{rootPath}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-lg px-1"
            title="Close (ESC)"
          >
            &times;
          </button>
        </div>

        {/* Tree content */}
        <div className="flex-1 overflow-y-auto py-2">
          {renderEntries(rootPath, 0)}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex-shrink-0">
          <p className="text-[10px] text-muted-foreground">
            ESC to close
          </p>
        </div>
      </div>
    </div>
  );
}
