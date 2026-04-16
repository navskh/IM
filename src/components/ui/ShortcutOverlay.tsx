'use client';

import { useEffect, useState } from 'react';

const SECTIONS: { title: string; shortcuts: { keys: string; desc: string }[] }[] = [
  {
    title: '전역',
    shortcuts: [
      { keys: '⌘P', desc: '전역 검색' },
      { keys: '⌘N', desc: '빠른 태스크 생성' },
      { keys: '⌘M', desc: '전역 메모 (Quick Memo)' },
      { keys: '⌘J', desc: '전역 AI 어드바이저' },
      { keys: '?', desc: '이 도움말' },
    ],
  },
  {
    title: '워크스페이스',
    shortcuts: [
      { keys: '⌘L', desc: 'Project Advisor 열기/닫기' },
      { keys: 'B', desc: '브레인스토밍 패널 토글' },
      { keys: 'N', desc: '새 프로젝트 추가' },
      { keys: 'T', desc: '새 태스크 추가' },
      { keys: '⌘1', desc: '상태 → Idea' },
      { keys: '⌘2', desc: '상태 → Doing' },
      { keys: '⌘3', desc: '상태 → Done' },
      { keys: '⌘4', desc: '상태 → Problem' },
    ],
  },
  {
    title: '노트 에디터',
    shortcuts: [
      { keys: '⌘K', desc: 'AI 명령 팔레트' },
      { keys: '⌘⇧T', desc: '체크박스/불릿 → 태스크 승격' },
      { keys: '/', desc: '슬래시 명령 (/todo, /table, /code…)' },
      { keys: '⌘↵', desc: '체크박스 토글 [ ] ↔ [x]' },
      { keys: '⌘⇧↵', desc: '테이블 행 추가' },
      { keys: '⌘⇧⌫', desc: '테이블 행 삭제' },
      { keys: 'Tab', desc: '고스트 자동완성 수락' },
      { keys: 'Esc', desc: '고스트 해제' },
      { keys: 'Enter', desc: '리스트 자동 이어쓰기' },
    ],
  },
];

export default function ShortcutOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const isInput =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          (target?.isContentEditable ?? false) ||
          !!target?.closest?.('.cm-editor');
        if (isInput) return;
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg animate-dialog-in p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Keyboard Shortcuts</h2>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>
        <div className="space-y-4">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1.5">{section.title}</div>
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                {section.shortcuts.map((s) => (
                  <div key={s.keys} className="contents">
                    <kbd className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted border border-border text-foreground text-right whitespace-nowrap">
                      {s.keys}
                    </kbd>
                    <span className="text-xs text-muted-foreground self-center">{s.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-[10px] text-muted-foreground/50 text-center">
          ? 를 다시 눌러 닫기
        </div>
      </div>
    </div>
  );
}
