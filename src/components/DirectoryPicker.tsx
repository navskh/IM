'use client';

import { useState, useEffect, useCallback } from 'react';

interface DirEntry {
  name: string;
  path: string;
}

interface DirInfo {
  current: string;
  parent: string | null;
  dirs: DirEntry[];
  isProject: boolean;
}

interface DirectoryPickerProps {
  onSelect: (path: string) => void;
  onCancel: () => void;
  initialPath?: string;
}

export default function DirectoryPicker({ onSelect, onCancel, initialPath }: DirectoryPickerProps) {
  const [dirInfo, setDirInfo] = useState<DirInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState(false);

  const loadDir = useCallback(async (dirPath?: string) => {
    setLoading(true);
    setError(null);
    setPermissionError(false);
    try {
      const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
      const res = await fetch(`/api/filesystem${params}`);
      if (res.ok) {
        setDirInfo(await res.json());
      } else {
        const data = await res.json();
        setError(data.error || '불러오기 실패');
        if (data.permissionError) setPermissionError(true);
      }
    } catch {
      setError('불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDir(initialPath);
  }, [loadDir, initialPath]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="bg-card border border-border rounded-lg shadow-xl w-[520px] max-h-[70vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">프로젝트 폴더 선택</h3>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground text-lg leading-none">&times;</button>
        </div>

        {/* Current path */}
        <div className="px-4 py-2 border-b border-border bg-muted">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">경로:</span>
            <span className="text-xs font-mono truncate flex-1" title={dirInfo?.current}>
              {dirInfo?.current || '...'}
            </span>
            {dirInfo?.isProject && (
              <span className="text-xs text-success shrink-0 font-medium">프로젝트 감지</span>
            )}
          </div>
        </div>

        {/* Directory list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">불러오는 중...</div>
          ) : error ? (
            <div className="p-6 text-center">
              <div className="text-destructive text-sm mb-2">{error}</div>
              {permissionError && (
                <div className="text-xs text-muted-foreground leading-relaxed mt-3 text-left bg-muted rounded-md p-3">
                  <p className="font-semibold mb-1">macOS 권한 설정이 필요합니다</p>
                  <p>시스템 설정 → 개인정보 보호 및 보안 → 전체 디스크 접근 권한에서 터미널 앱을 추가해주세요.</p>
                  <p className="mt-1 text-muted-foreground">Documents, Desktop 등 보호된 폴더는 별도 권한이 필요합니다.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="py-1">
              {/* Parent directory */}
              {dirInfo?.parent && (
                <button
                  onClick={() => loadDir(dirInfo.parent!)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors
                             flex items-center gap-2 text-muted-foreground"
                >
                  <span>↑</span>
                  <span>..</span>
                </button>
              )}

              {/* Subdirectories */}
              {dirInfo?.dirs.length === 0 && (
                <div className="px-4 py-6 text-center text-muted-foreground text-xs">
                  하위 폴더가 없습니다
                </div>
              )}
              {dirInfo?.dirs.map(dir => (
                <button
                  key={dir.path}
                  onClick={() => loadDir(dir.path)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors
                             flex items-center gap-2"
                >
                  <span className="text-muted-foreground">📁</span>
                  <span>{dir.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => dirInfo && onSelect(dirInfo.current)}
            disabled={!dirInfo}
            className="px-4 py-1.5 text-xs bg-primary hover:bg-primary-hover text-white
                       rounded-md transition-colors disabled:opacity-50"
          >
            이 폴더 선택
          </button>
        </div>
      </div>
    </div>
  );
}
