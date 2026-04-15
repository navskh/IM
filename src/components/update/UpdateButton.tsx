'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface VersionInfo {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
}

interface UpdateResult {
  ok: boolean;
  code?: number | null;
  signal?: string | null;
  stdout?: string;
  stderr?: string;
  error?: string;
  durationMs?: number;
}

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // re-check hourly
const DISMISS_KEY = 'im-update-dismissed';

export default function UpdateButton() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [result, setResult] = useState<UpdateResult | null>(null);
  const dismissedRef = useRef<string | null>(null);

  useEffect(() => {
    dismissedRef.current = typeof window !== 'undefined' ? localStorage.getItem(DISMISS_KEY) : null;
  }, []);

  const fetchVersion = useCallback(async () => {
    try {
      const res = await fetch('/api/version');
      if (!res.ok) return;
      const data = await res.json() as VersionInfo;
      setInfo(data);
    } catch { /* offline or cold — ignore */ }
  }, []);

  useEffect(() => {
    fetchVersion();
    const id = setInterval(fetchVersion, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchVersion]);

  const isDismissed = info?.latest !== null && info?.latest === dismissedRef.current;
  const showBadge = !!info?.updateAvailable && !isDismissed;

  const install = useCallback(async () => {
    setInstalling(true);
    setResult(null);
    try {
      const res = await fetch('/api/update', { method: 'POST' });
      const data = await res.json() as UpdateResult;
      setResult(data);
      if (data.ok) {
        setInstalled(true);
        await fetchVersion();
      }
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : 'Network error' });
    } finally {
      setInstalling(false);
    }
  }, [fetchVersion]);

  const dismiss = useCallback(() => {
    if (info?.latest) {
      try { localStorage.setItem(DISMISS_KEY, info.latest); } catch { /* quota */ }
      dismissedRef.current = info.latest;
    }
    setInfo(prev => prev ? { ...prev, updateAvailable: false } : prev);
  }, [info?.latest]);

  return (
    <>
      {showBadge ? (
        <button
          onClick={() => setModalOpen(true)}
          title={`IM v${info?.latest} 업데이트 가능 (현재 ${info?.current})`}
          className="text-xs px-2 py-1 rounded-md border border-success/40 bg-success/15 text-success
                     hover:bg-success/25 transition-colors flex items-center gap-1.5 mr-2"
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          v{info?.latest} 업데이트
        </button>
      ) : info ? (
        <button
          onClick={() => setModalOpen(true)}
          title={`현재 IM v${info.current} · 업데이트 확인`}
          className="text-[10px] px-1.5 py-0.5 rounded text-muted-foreground/60 hover:text-muted-foreground transition-colors mr-2"
        >
          v{info.current}
        </button>
      ) : null}

      {modalOpen && (
        <div
          onClick={() => !installing && setModalOpen(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md animate-dialog-in p-5 flex flex-col gap-3"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground">IM 업데이트</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  현재 <span className="text-foreground font-mono">v{info?.current}</span>
                  {info?.latest && (
                    <>
                      {' → '}
                      <span className={`font-mono ${info.updateAvailable ? 'text-success' : 'text-foreground'}`}>
                        v{info.latest}
                      </span>
                    </>
                  )}
                </div>
              </div>
              {!installing && (
                <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
              )}
            </div>

            {installed ? (
              <div className="flex flex-col gap-2">
                <div className="text-sm text-success flex items-center gap-2">
                  <span>✓</span>
                  <span>설치 완료</span>
                  {result?.durationMs && (
                    <span className="text-xs text-muted-foreground">({Math.round(result.durationMs / 1000)}s)</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  새 버전을 반영하려면 <span className="font-mono text-foreground">im start</span> 프로세스를 재시작하세요.
                  PM2로 실행 중이면 <span className="font-mono text-foreground">pm2 restart idea-manager</span>로 즉시 반영됩니다.
                </div>
              </div>
            ) : installing ? (
              <div className="flex items-center gap-2 text-sm text-foreground">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                <span>설치 중… (최대 3분)</span>
              </div>
            ) : info?.updateAvailable ? (
              <>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-mono">npm install -g idea-manager@latest</span>를 실행해 최신 버전을 설치합니다.
                  설치가 끝나면 재시작 안내가 표시됩니다.
                </div>
                <div className="flex justify-end gap-2 mt-1">
                  <button onClick={dismiss} className="text-xs text-muted-foreground px-2 py-1 hover:text-foreground transition-colors">
                    이 버전 건너뜀
                  </button>
                  <button
                    onClick={install}
                    className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
                  >
                    지금 설치
                  </button>
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground">
                최신 버전을 사용 중입니다.
              </div>
            )}

            {result && !result.ok && (
              <div className="mt-2 flex flex-col gap-1.5">
                <div className="text-xs text-destructive">⚠ 설치 실패{result.code !== undefined && result.code !== null ? ` (exit ${result.code})` : ''}</div>
                {(result.stderr || result.error) && (
                  <pre className="text-[10px] bg-muted/50 border border-border rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">
                    {result.stderr || result.error}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
