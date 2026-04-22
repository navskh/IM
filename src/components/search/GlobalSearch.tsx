'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTabContext } from '@/components/tabs/TabContext';
import { mod } from '@/lib/platform';
import type { ISearchResult } from '@/app/api/search/route';

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ISearchResult[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { openProject, setActiveTab } = useTabContext();
  const abortRef = useRef<AbortController | null>(null);

  // Global ⌘P / Ctrl+P shortcut (K is also acceptable in some editors;
  // P is used because ⌘K is the note-refine palette).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Reset state each time it opens
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
    setIdx(0);
    // defer focus until after modal animation paint
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 1) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: abort.signal })
        .then(r => r.ok ? r.json() : [])
        .then((data: ISearchResult[]) => {
          setResults(Array.isArray(data) ? data : []);
          setIdx(0);
          setLoading(false);
        })
        .catch(() => { /* aborted or network — leave UI steady */ });
    }, 120);
    return () => clearTimeout(timer);
  }, [query, open]);

  const pick = useCallback((r: ISearchResult) => {
    if (r.type === 'memo') {
      setActiveTab('dashboard');
    } else {
      openProject(r.projectId, r.projectName, r.subProjectId, r.taskId);
    }
    setOpen(false);
  }, [openProject, setActiveTab]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, results.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = results[idx];
      if (target) pick(target);
    }
  };

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[14vh]"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-xl animate-dialog-in"
      >
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <span className="text-muted-foreground">🔎</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`태스크 · 프로젝트 · 브레인스토밍 · 메모 검색… (${mod()}P)`}
            className="flex-1 bg-transparent text-sm text-foreground focus:outline-none"
          />
          <span className="text-[10px] text-muted-foreground/70 px-1.5 py-0.5 border border-border rounded">
            ↑↓ · ↵ · Esc
          </span>
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          {loading && (
            <div className="px-4 py-6 text-xs text-muted-foreground">검색 중…</div>
          )}
          {!loading && query.trim() && results.length === 0 && (
            <div className="px-4 py-6 text-xs text-muted-foreground">일치하는 항목 없음</div>
          )}
          {!loading && !query.trim() && (
            <div className="px-4 py-6 text-xs text-muted-foreground">
              무엇을 찾으시나요? 태스크 제목·본문, 프로젝트·워크스페이스 이름을 검색합니다.
            </div>
          )}
          <ul>
            {results.map((r, i) => (
              <li
                key={`${r.type}-${r.taskId ?? r.subProjectId ?? r.projectId}`}
                onMouseEnter={() => setIdx(i)}
                onClick={() => pick(r)}
                className={`px-4 py-2.5 cursor-pointer border-l-2 ${
                  i === idx ? 'bg-muted border-primary' : 'border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide ${
                    r.type === 'task' ? 'bg-primary/15 text-primary' :
                    r.type === 'project' ? 'bg-accent/15 text-accent' :
                    r.type === 'brainstorm' ? 'bg-success/15 text-success' :
                    r.type === 'memo' ? 'bg-muted text-muted-foreground' :
                    'bg-warning/15 text-warning'
                  }`}>
                    {r.type === 'sub-project' ? 'project' : r.type}
                  </span>
                  <span>{r.projectName}</span>
                  {r.subProjectName && r.type === 'task' && (
                    <>
                      <span className="opacity-50">›</span>
                      <span>{r.subProjectName}</span>
                    </>
                  )}
                  {r.isArchived && <span className="text-muted-foreground/70 italic">(archived)</span>}
                </div>
                <div className="text-sm text-foreground mt-0.5 truncate">{r.title}</div>
                {r.snippet && (
                  <div className="text-xs text-muted-foreground/80 mt-0.5 truncate">{r.snippet}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
