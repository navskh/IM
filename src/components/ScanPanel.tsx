'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

interface ScannedFileInfo {
  file_path: string;
  size: number;
  category: string;
  folder: string;
  summarized?: boolean;
}

interface ChunkInfo {
  name: string;
  index: number;
  fileCount: number;
  status: 'pending' | 'active' | 'done' | 'error';
  itemCount?: number;
  error?: string;
  files?: string[];
}

interface PhaseInfo {
  name: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

type ScanStep = 'idle' | 'scanning' | 'analyzing' | 'scanned' | 'structuring' | 'done';

interface ScanPanelProps {
  projectId: string;
  onComplete: (result: { items: unknown[]; message?: unknown; memos?: unknown[] }) => void;
  onCancel: () => void;
}

function requestNotificationPermission() {
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendNotification(title: string, body: string) {
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/icon.svg' });
  }
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

function formatScannedAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '방금 스캔';
  if (diffMin < 60) return `${diffMin}분 전 스캔`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전 스캔`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}일 전 스캔`;
}

export default function ScanPanel({ projectId, onComplete, onCancel }: ScanPanelProps) {
  const [step, setStep] = useState<ScanStep>('idle');
  const [currentDir, setCurrentDir] = useState('');
  const [files, setFiles] = useState<ScannedFileInfo[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [structureStatus, setStructureStatus] = useState('');
  const [chunks, setChunks] = useState<ChunkInfo[]>([]);
  const [currentChunkIdx, setCurrentChunkIdx] = useState(-1);
  const [aiText, setAiText] = useState('');
  const [subAiTexts, setSubAiTexts] = useState<Map<string, string>>(new Map());
  const [phases, setPhases] = useState<PhaseInfo[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [projectDescription, setProjectDescription] = useState('');
  const [analysisText, setAnalysisText] = useState('');
  const aiTextRef = useRef<HTMLDivElement>(null);
  const analysisRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Request notification permission on mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Auto-scroll AI text area
  useEffect(() => {
    if (aiTextRef.current) {
      aiTextRef.current.scrollTop = aiTextRef.current.scrollHeight;
    }
  }, [aiText, subAiTexts]);

  // Auto-scroll analysis text area
  useEffect(() => {
    if (analysisRef.current) {
      analysisRef.current.scrollTop = analysisRef.current.scrollHeight;
    }
  }, [analysisText]);

  // Elapsed timer
  useEffect(() => {
    if (step === 'structuring') {
      setElapsed(0);
      elapsedRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (elapsedRef.current) {
        clearInterval(elapsedRef.current);
        elapsedRef.current = null;
      }
    }
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, [step]);

  const startScan = useCallback(() => {
    setStep('scanning');
    setFiles([]);
    setError(null);
    setCollapsedFolders(new Set());
    setAnalysisText('');
    setProjectDescription('');

    const eventSource = new EventSource(`/api/projects/${projectId}/scan/stream`);

    eventSource.addEventListener('scanning', (e) => {
      const data = JSON.parse(e.data);
      setCurrentDir(data.dir);
    });

    eventSource.addEventListener('file', (e) => {
      const data = JSON.parse(e.data);
      setFiles(prev => {
        if (prev.some(f => f.file_path === data.file_path)) return prev;
        return [...prev, {
          file_path: data.file_path,
          size: data.size,
          category: data.category || 'other',
          folder: data.folder || '(root)',
          summarized: data.summarized || false,
        }];
      });
    });

    eventSource.addEventListener('scan_complete', (e) => {
      const data = JSON.parse(e.data);
      setTotalSize(data.totalSize);
      setStep('analyzing');
    });

    eventSource.addEventListener('analyzing', () => {
      setStep('analyzing');
    });

    eventSource.addEventListener('analysis_text', (e) => {
      const data = JSON.parse(e.data);
      setAnalysisText(prev => prev + data.text);
    });

    eventSource.addEventListener('analysis_done', (e) => {
      const data = JSON.parse(e.data);
      if (data.description) {
        setProjectDescription(data.description);
      }
      setStep('scanned');
      eventSource.close();
    });

    eventSource.addEventListener('error', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        setError(data.error);
      } catch {
        setError('스캔 중 오류가 발생했습니다');
      }
      setStep('idle');
      eventSource.close();
    });

    eventSource.onerror = () => {
      eventSource.close();
      setStep(prev => {
        if (prev === 'scanning') return 'idle';
        if (prev === 'analyzing') return 'scanned'; // analysis failed, still show files
        return prev;
      });
    };
  }, [projectId]);

  // Load existing state on mount: check active task first, then existing scan data
  useEffect(() => {
    let cancelled = false;
    async function loadExisting() {
      // 1. Check if there's an active structuring task
      try {
        const taskRes = await fetch(`/api/projects/${projectId}/structure`);
        if (taskRes.ok) {
          const taskData = await taskRes.json();
          if (cancelled) return;
          if (taskData.active) {
            // Reconnect to the running task
            startStructure();
            return;
          }
        }
      } catch { /* ignore */ }

      // 2. Always start fresh scan (includes auto-analysis)
      startScan();
    }
    loadExisting();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const startStructure = useCallback(() => {
    setStep('structuring');
    setStructureStatus('분석 준비 중...');
    setChunks([]);
    setCurrentChunkIdx(-1);
    setAiText('');
    setSubAiTexts(new Map());
    setPhases([]);

    const descParam = projectDescription.trim()
      ? `?desc=${encodeURIComponent(projectDescription.trim())}`
      : '';
    const eventSource = new EventSource(`/api/projects/${projectId}/structure/stream${descParam}`);

    eventSource.addEventListener('status', (e) => {
      const data = JSON.parse(e.data);
      setStructureStatus(data.message);
    });

    eventSource.addEventListener('phase_list', (e) => {
      const data = JSON.parse(e.data);
      setPhases(data.phases);
    });

    eventSource.addEventListener('phase_update', (e) => {
      const data = JSON.parse(e.data);
      setPhases(prev => prev.map((p, i) =>
        i === data.index ? { ...p, status: data.status } : p
      ));
    });

    eventSource.addEventListener('hub_document', () => {
      // Hub document updated — could show it, for now just acknowledge
    });

    eventSource.addEventListener('chunk_list', (e) => {
      const data = JSON.parse(e.data);
      setChunks(data.chunks.map((c: { name: string; index: number; fileCount: number }) => ({
        ...c,
        status: 'pending' as const,
      })));
    });

    eventSource.addEventListener('ai_text', (e) => {
      const data = JSON.parse(e.data);
      if (data.subProject) {
        setSubAiTexts(prev => {
          const next = new Map(prev);
          next.set(data.subProject, (next.get(data.subProject) || '') + data.text);
          return next;
        });
      } else {
        setAiText(prev => prev + data.text);
      }
    });

    eventSource.addEventListener('ai_text_reset', () => {
      setAiText('');
      setSubAiTexts(new Map());
    });

    eventSource.addEventListener('ai_event', (e) => {
      const parsed = JSON.parse(e.data);
      if (parsed.type === 'content_block_delta' && parsed.delta?.text) return;
      if (parsed.type === 'assistant' && parsed.message?.content) return;
    });

    eventSource.addEventListener('structuring_sub', (e) => {
      const data = JSON.parse(e.data);
      setCurrentChunkIdx(data.current - 1);
      setStructureStatus(`서브 프로젝트 분석 중: ${data.subProject}`);
      setChunks(prev => prev.map((c, i) => {
        const chunkIdx = prev.findIndex(ch => ch.name === data.subProject);
        return i === chunkIdx
          ? { ...c, status: 'active' as const, files: data.files || [] }
          : c;
      }));
    });

    eventSource.addEventListener('structuring_sub_done', (e) => {
      const data = JSON.parse(e.data);
      setChunks(prev => prev.map((c) =>
        c.name === data.subProject
          ? {
              ...c,
              status: data.error ? 'error' as const : 'done' as const,
              itemCount: data.itemCount,
              error: data.error,
            }
          : c
      ));
    });

    eventSource.addEventListener('done', (e) => {
      const data = JSON.parse(e.data);
      setStep('done');
      eventSource.close();
      onComplete(data);
      sendNotification('IM - 분석 완료', '프로젝트 구조화가 완료되었습니다.');
    });

    eventSource.addEventListener('error', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        setError(data.error);
      } catch {
        setError('구조화 중 오류가 발생했습니다');
      }
      setStep('scanned');
      eventSource.close();
      sendNotification('IM - 분석 실패', '구조화 중 오류가 발생했습니다.');
    });

    eventSource.onerror = () => {
      eventSource.close();
      setStep(prev => prev === 'structuring' ? 'scanned' : prev);
    };
  }, [projectId, onComplete]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  // Group files by folder
  const folderGroups = useMemo(() => {
    const groups = new Map<string, ScannedFileInfo[]>();
    for (const file of files) {
      const folder = file.folder || '(root)';
      if (!groups.has(folder)) groups.set(folder, []);
      groups.get(folder)!.push(file);
    }
    // Sort folders: (root) first, then alphabetical
    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        if (a === '(root)') return -1;
        if (b === '(root)') return 1;
        return a.localeCompare(b);
      })
      .map(([folder, folderFiles]) => ({
        folder,
        files: folderFiles,
        totalSize: folderFiles.reduce((s, f) => s + f.size, 0),
      }));
  }, [files]);

  // Auto-collapse folders beyond top 5 when scan completes
  useEffect(() => {
    if (step === 'scanned' && folderGroups.length > 5) {
      const toCollapse = new Set(folderGroups.slice(5).map(g => g.folder));
      setCollapsedFolders(toCollapse);
    }
  }, [step, folderGroups]);

  const toggleFolder = (folder: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  const sourceCount = files.filter(f => f.category === 'source').length;
  const docCount = files.filter(f => f.category === 'doc').length;
  const configCount = files.filter(f => f.category === 'config').length;
  const summarizedCount = files.filter(f => f.summarized).length;

  const doneChunks = chunks.filter(c => c.status === 'done' || c.status === 'error').length;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">프로젝트 스캔</h3>
          {step === 'scanning' && (
            <span className="text-xs text-muted-foreground animate-pulse">스캔 중...</span>
          )}
          {step === 'analyzing' && (
            <span className="text-xs text-accent animate-pulse">프로젝트 분석 중...</span>
          )}
          {step === 'scanned' && (
            <span className="text-xs text-success">{files.length}개 파일 발견</span>
          )}
          {step === 'structuring' && (
            <span className="text-xs text-accent animate-pulse">AI 구조화 중...</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {step === 'structuring' && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatElapsed(elapsed)}
            </span>
          )}
          <button
            onClick={onCancel}
            disabled={step === 'structuring' || step === 'analyzing'}
            className="text-muted-foreground hover:text-foreground text-sm disabled:opacity-30"
          >
            닫기
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {(step === 'scanning' || step === 'analyzing' || step === 'structuring') && (
        <div className="h-1.5 bg-muted overflow-hidden">
          {step === 'scanning' ? (
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${Math.min(files.length * 2, 95)}%` }}
            />
          ) : chunks.length > 0 ? (
            <div
              className="h-full bg-accent transition-all duration-500"
              style={{ width: `${((doneChunks + (currentChunkIdx >= 0 ? 0.5 : 0)) / chunks.length) * 100}%` }}
            />
          ) : (
            <div className="h-full bg-accent animate-progress-indeterminate" />
          )}
        </div>
      )}

      {/* Status area */}
      {step === 'scanning' && currentDir && (
        <div className="px-4 py-1.5 border-b border-border bg-muted/50 flex items-center justify-between">
          <span className="text-xs font-mono text-muted-foreground truncate">
            탐색 중: {currentDir}
          </span>
          <span className="text-xs text-muted-foreground shrink-0 ml-2">
            {files.length}개 발견
          </span>
        </div>
      )}

      {step === 'structuring' && (
        <div className="px-4 py-2 border-b border-border bg-accent/5">
          {/* Phase indicators */}
          {phases.length > 0 && (
            <div className="flex items-center gap-3 mb-1.5">
              {phases.map((phase, i) => (
                <div key={i} className={`flex items-center gap-1 text-[10px] ${
                  phase.status === 'active' ? 'text-accent font-semibold' :
                  phase.status === 'done' ? 'text-success' :
                  phase.status === 'error' ? 'text-destructive' :
                  'text-muted-foreground/40'
                }`}>
                  <span>
                    {phase.status === 'done' ? '\u2713' :
                     phase.status === 'error' ? '\u2717' :
                     phase.status === 'active' ? '\u25C9' : '\u25CB'}
                  </span>
                  <span>P{i + 1}</span>
                  {i < phases.length - 1 && <span className="text-muted-foreground/20 ml-2">→</span>}
                </div>
              ))}
            </div>
          )}
          <div className="text-xs text-accent font-medium">{structureStatus}</div>
          {chunks.length > 0 && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {doneChunks} / {chunks.length} 서브 프로젝트 완료
            </div>
          )}
        </div>
      )}

      {/* Stats bar */}
      {step !== 'scanning' && step !== 'idle' && files.length > 0 && step !== 'structuring' && (
        <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            소스 <span className="text-foreground font-medium">{sourceCount}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            문서 <span className="text-foreground font-medium">{docCount}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            설정 <span className="text-foreground font-medium">{configCount}</span>
          </span>
          {summarizedCount > 0 && (
            <span className="text-xs text-muted-foreground">
              요약 <span className="text-accent font-medium">{summarizedCount}</span>
            </span>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            총 {formatSize(totalSize || files.reduce((s, f) => s + f.size, 0))}
          </span>
        </div>
      )}

      {/* File list / Structure progress / AI Text */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-2">
        {error && (
          <div className="text-sm text-destructive mb-3 p-2 bg-destructive/10 rounded">{error}</div>
        )}

        {files.length === 0 && step === 'scanning' && (
          <div className="text-sm text-muted-foreground py-8 text-center">
            파일을 찾는 중...
          </div>
        )}

        {/* Analyzing view — AI auto-analysis streaming */}
        {step === 'analyzing' && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="text-sm text-accent font-medium animate-pulse">
              프로젝트를 분석하고 있습니다...
            </div>
            <div className="text-xs text-muted-foreground text-center">
              디렉토리 구조와 핵심 파일을 바탕으로 프로젝트 개요를 작성 중입니다
            </div>
            {analysisText && (
              <div ref={analysisRef} className="w-full max-h-[40vh] overflow-y-auto bg-muted/30 rounded-lg p-4">
                <pre className="text-xs font-mono text-foreground/70 whitespace-pre-wrap break-all leading-relaxed">
                  {analysisText}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Structuring view — chunk list with inline file list + AI text */}
        {step === 'structuring' && (
          <div className="flex flex-col gap-0">
            {chunks.length > 0 ? (
              <div className="space-y-0">
                {/* Phase 1/3 AI text — shown when no chunk is active */}
                {!chunks.some(c => c.status === 'active') && aiText && (
                  <div className="p-3">
                    <div ref={aiTextRef} className="max-h-[50vh] overflow-y-auto bg-muted/30 rounded p-3">
                      <pre className="text-xs font-mono text-foreground/70 whitespace-pre-wrap break-all leading-relaxed">
                        {aiText}
                      </pre>
                    </div>
                  </div>
                )}

                {chunks.map((chunk, i) => (
                  <div key={i}>
                    {/* Chunk row */}
                    <div
                      className={`flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                        chunk.status === 'active' ? 'bg-accent/10 text-accent' :
                        chunk.status === 'done' ? 'text-muted-foreground' :
                        chunk.status === 'error' ? 'bg-destructive/10 text-destructive' :
                        'text-muted-foreground/40'
                      }`}
                    >
                      <span className="w-5 text-center flex-shrink-0">
                        {chunk.status === 'done' ? '\u2713' :
                         chunk.status === 'error' ? '\u2717' :
                         chunk.status === 'active' ? '\u25C9' : '\u25CB'}
                      </span>
                      <span className={`truncate flex-1 ${chunk.status === 'active' ? 'font-medium' : ''}`}>
                        {chunk.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 flex-shrink-0">
                        {chunk.fileCount}개 파일
                      </span>
                      {chunk.status === 'active' && (
                        <span className="animate-pulse flex-shrink-0">분석 중...</span>
                      )}
                      {chunk.status === 'done' && !!chunk.itemCount && (
                        <span className="flex-shrink-0">{chunk.itemCount}개 항목</span>
                      )}
                      {chunk.status === 'error' && (
                        <span className="flex-shrink-0 text-destructive">실패</span>
                      )}
                    </div>

                    {/* Inline expansion for active chunk: files + AI text */}
                    {chunk.status === 'active' && (
                      <div className="ml-8 mr-3 mb-2 border-l-2 border-accent/30 pl-3 space-y-2">
                        {/* File list */}
                        {chunk.files && chunk.files.length > 0 && (
                          <div className="space-y-0.5 max-h-32 overflow-y-auto py-1">
                            {chunk.files.map((f, fi) => (
                              <div key={fi} className="text-[11px] font-mono text-muted-foreground/60 truncate">
                                {f}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* AI streaming text for this sub-project */}
                        {subAiTexts.get(chunk.name) ? (
                          <div ref={aiTextRef} className="max-h-44 overflow-y-auto bg-muted/30 rounded p-2">
                            <pre className="text-[11px] font-mono text-foreground/60 whitespace-pre-wrap break-all leading-relaxed">
                              {subAiTexts.get(chunk.name)}
                            </pre>
                          </div>
                        ) : (
                          <div className="text-[11px] text-muted-foreground/50 animate-pulse py-1">
                            AI 응답 대기 중...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              /* Single mode (no chunks) — show AI text directly */
              <div className="p-3">
                {aiText ? (
                  <div ref={aiTextRef} className="max-h-[60vh] overflow-y-auto bg-muted/30 rounded p-3">
                    <pre className="text-xs font-mono text-foreground/70 whitespace-pre-wrap break-all leading-relaxed">
                      {aiText}
                    </pre>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground animate-pulse text-center py-8">
                    AI가 분석하고 있습니다...
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Folder-grouped file list */}
        {step !== 'structuring' && folderGroups.map(group => {
          const isCollapsed = collapsedFolders.has(group.folder);
          return (
            <div key={group.folder} className="mb-3">
              <button
                onClick={() => toggleFolder(group.folder)}
                className="w-full text-left text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1.5 hover:text-foreground transition-colors"
              >
                <span className="text-[10px] w-3 text-center">
                  {isCollapsed ? '\u25B6' : '\u25BC'}
                </span>
                <span className="font-mono">{group.folder === '(root)' ? '/' : group.folder + '/'}</span>
                <span className="text-muted-foreground/40">({group.files.length}개, {formatSize(group.totalSize)})</span>
              </button>
              {!isCollapsed && (
                <div className="ml-4 space-y-0.5">
                  {group.files.map((file) => (
                    <div
                      key={file.file_path}
                      className="flex items-center justify-between text-xs py-0.5 animate-scan-in"
                    >
                      <span className="font-mono truncate flex-1 text-foreground/80">
                        {file.file_path.split('/').pop()}
                        {file.summarized && (
                          <span className="ml-1.5 text-[9px] font-sans text-accent bg-accent/10 px-1 py-0.5 rounded">S</span>
                        )}
                      </span>
                      <span className="text-muted-foreground/40 shrink-0 ml-2 tabular-nums">
                        {formatSize(file.size)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-3">
        {step === 'scanned' && (
          <div className="space-y-3">
            <textarea
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              placeholder="AI가 자동으로 분석한 프로젝트 설명이 여기에 표시됩니다. 자유롭게 수정하세요."
              className="w-full text-xs bg-muted/50 border border-border rounded-md px-3 py-2 resize-y
                         placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-accent/50
                         text-foreground leading-relaxed"
              rows={5}
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {files.length}개 파일 · {formatSize(totalSize)}
                </span>
                {scannedAt && (
                  <span className="text-[10px] text-muted-foreground/50">
                    {formatScannedAt(scannedAt)}
                  </span>
                )}
                <button
                  onClick={() => { setScannedAt(null); startScan(); }}
                  className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground underline"
                >
                  재스캔
                </button>
              </div>
              <button
                onClick={startStructure}
                className="px-4 py-1.5 text-xs bg-accent hover:bg-accent/80 text-white rounded-md transition-colors"
              >
                AI로 구조화하기
              </button>
            </div>
          </div>
        )}
        {step === 'structuring' && (
          <div className="text-xs text-muted-foreground text-center">
            {chunks.length > 0
              ? `${doneChunks}/${chunks.length} 서브 프로젝트 분석 중... (${formatElapsed(elapsed)})`
              : structureStatus}
          </div>
        )}
        {step === 'scanning' && (
          <div className="text-xs text-muted-foreground text-center">
            프로젝트 디렉토리를 재귀적으로 탐색하고 있습니다...
          </div>
        )}
        {step === 'analyzing' && (
          <div className="text-xs text-muted-foreground text-center">
            {files.length}개 파일 스캔 완료 · AI가 프로젝트를 분석하고 있습니다...
          </div>
        )}
      </div>
    </div>
  );
}
