'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export default function GlobalMemoLayer() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open || loaded) return;
    fetch('/api/global-memo')
      .then(r => r.ok ? r.json() : { content: '' })
      .then(d => { setContent(d.content || ''); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [open, loaded]);

  const save = useCallback((value: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch('/api/global-memo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: value }),
      }).catch(() => {});
    }, 600);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setContent(v);
    save(v);
  };

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-[55] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-xl shadow-2xl w-[520px] max-w-[90vw] h-[65vh] max-h-[550px] flex flex-col animate-dialog-in"
      >
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Quick Memo</span>
            <span className="text-[10px] text-muted-foreground/60">⌘M</span>
          </div>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>
        <div className="flex-1 min-h-0 p-1">
          <textarea
            value={content}
            onChange={handleChange}
            placeholder="자유롭게 메모하세요… 전역 스크래치패드입니다."
            className="w-full h-full bg-transparent text-sm text-foreground resize-none focus:outline-none p-3 font-mono leading-relaxed"
            autoFocus
          />
        </div>
        <div className="px-4 py-1.5 border-t border-border text-[10px] text-muted-foreground/50 flex-shrink-0">
          자동 저장 · Esc로 닫기
        </div>
      </div>
    </div>
  );
}
