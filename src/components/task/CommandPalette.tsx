'use client';

import { useEffect, useRef, useState } from 'react';

export type RefineCommand =
  | 'continue'
  | 'tidy'
  | 'split'
  | 'to-questions'
  | 'summarize'
  | 'custom';

const COMMANDS: { key: RefineCommand; label: string; hint: string }[] = [
  { key: 'continue',     label: '이어서 써줘',          hint: '커서 앞 맥락을 이어서 자연스럽게 덧붙임' },
  { key: 'tidy',         label: '이 부분 정리해줘',     hint: '선택 영역을 깔끔히 다듬음 (의미 유지)' },
  { key: 'split',        label: '할 일로 쪼개줘',       hint: '선택 영역을 체크박스 리스트로' },
  { key: 'to-questions', label: '질문으로 바꿔줘',      hint: '모호한 부분을 명확하게 하는 질문 목록으로' },
  { key: 'summarize',    label: '요약해줘',             hint: '선택 영역을 3줄 이내로' },
  { key: 'custom',       label: '직접 입력…',           hint: '임의 명령을 프롬프트로 전달' },
];

const HISTORY_KEY = 'im-refine-custom-history';
const HISTORY_MAX = 8;

function loadHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : [];
  } catch { return []; }
}

function pushHistory(entry: string) {
  if (typeof window === 'undefined') return;
  const trimmed = entry.trim();
  if (!trimmed) return;
  const prev = loadHistory().filter(x => x !== trimmed);
  const next = [trimmed, ...prev].slice(0, HISTORY_MAX);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* quota */ }
}

export default function CommandPalette({
  open,
  hasSelection,
  onClose,
  onRun,
}: {
  open: boolean;
  hasSelection: boolean;
  onClose: () => void;
  onRun: (cmd: RefineCommand, customText?: string) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [customMode, setCustomMode] = useState(false);
  const [custom, setCustom] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setIdx(0);
      setCustomMode(false);
      setCustom('');
    }
  }, [open]);

  useEffect(() => {
    if (customMode) {
      inputRef.current?.focus();
      setHistory(loadHistory());
    }
  }, [customMode]);

  if (!open) return null;

  const runAt = (i: number) => {
    const c = COMMANDS[i];
    if (c.key === 'custom') {
      setCustomMode(true);
      return;
    }
    onRun(c.key);
  };

  const submitCustom = () => {
    const t = custom.trim();
    if (!t) return;
    pushHistory(t);
    onRun('custom', t);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh]"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md animate-dialog-in"
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {hasSelection ? '선택 영역에 명령 실행' : '커서 위치 기준 명령 실행'}
          </div>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Esc</button>
        </div>

        {!customMode ? (
          <ul
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, COMMANDS.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); runAt(idx); }
            }}
            tabIndex={0}
            ref={(el) => { el?.focus(); }}
            className="py-1 max-h-[50vh] overflow-y-auto focus:outline-none"
          >
            {COMMANDS.map((c, i) => (
              <li
                key={c.key}
                onMouseEnter={() => setIdx(i)}
                onClick={() => runAt(i)}
                className={`px-4 py-2 cursor-pointer flex flex-col gap-0.5 ${
                  i === idx ? 'bg-muted' : ''
                }`}
              >
                <span className="text-sm text-foreground">{c.label}</span>
                <span className="text-xs text-muted-foreground">{c.hint}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-4 flex flex-col gap-3">
            <input
              ref={inputRef}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCustom();
                if (e.key === 'Escape') { e.preventDefault(); setCustomMode(false); }
              }}
              placeholder="예: 이 부분 markdown 표로 만들어줘"
              className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            {history.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">최근 명령</div>
                <div className="flex flex-wrap gap-1.5">
                  {history.map((h) => (
                    <button
                      key={h}
                      onClick={() => setCustom(h)}
                      title={h}
                      className="text-xs px-2 py-1 rounded border border-border text-muted-foreground
                                 hover:text-foreground hover:border-muted-foreground transition-colors
                                 max-w-[220px] truncate text-left"
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setCustomMode(false)} className="text-xs text-muted-foreground px-2 py-1">뒤로</button>
              <button
                onClick={submitCustom}
                disabled={!custom.trim()}
                className="text-xs px-3 py-1 bg-primary text-primary-foreground rounded disabled:opacity-40"
              >
                실행
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
