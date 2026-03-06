'use client';

import { useState, useEffect, useRef } from 'react';

export default function AiPolicyModal({
  open,
  content,
  onSave,
  onClose,
}: {
  open: boolean;
  content: string;
  onSave: (content: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(content);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open, content]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        onSave(draft);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, draft, onSave, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-[640px] max-h-[80vh] flex flex-col animate-dialog-in">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold">AI Policy</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI 채팅과 프롬프트 다듬기에 항상 포함되는 프로젝트 컨텍스트
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg px-1">
            x
          </button>
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`프로젝트 컨텍스트와 AI 지침을 작성하세요.

예시:
- 이 프로젝트는 JABIS 스마트워크 시스템입니다
- 기술 스택: React + TypeScript + Vite (monorepo)
- DB: PostgreSQL (jabis 스키마)
- 한국어로 응답할 것
- 코드 제안 시 기존 컨벤션을 따를 것`}
            className="w-full bg-input border border-border rounded-lg px-4 py-3 text-sm
                       text-foreground resize-none focus:border-primary focus:outline-none
                       leading-relaxed font-mono min-h-[300px]"
          />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <span className="text-xs text-muted-foreground">Cmd+Enter to save</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground
                         border border-border rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(draft)}
              className="px-3 py-1.5 text-xs bg-primary text-white rounded-md
                         hover:bg-primary-hover transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
