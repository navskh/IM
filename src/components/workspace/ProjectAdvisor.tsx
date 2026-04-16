'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { IProjectConversation } from '@/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ProjectAdvisor({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<IProjectConversation[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const basePath = `/api/projects/${projectId}/advisor`;

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(basePath);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setMessages(data);
    } catch { /* silent */ }
  }, [basePath]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setLoading(true);

    const tempId = `temp-${Date.now()}`;
    const userMsg: IProjectConversation = {
      id: tempId, project_id: projectId, role: 'user', content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await fetch(basePath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => {
          const withoutTemp = prev.filter(m => m.id !== tempId);
          return [...withoutTemp, data.userMessage, data.aiMessage];
        });
      }
    } catch { /* silent */ }
    setLoading(false);
    inputRef.current?.focus();
  }, [input, loading, basePath, projectId]);

  const handleClear = useCallback(async () => {
    await fetch(basePath, { method: 'DELETE' });
    setMessages([]);
    inputRef.current?.focus();
  }, [basePath]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" style={{ backdropFilter: 'blur(2px)' }} />

      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[480px] max-w-[85vw] h-full bg-card border-l border-border shadow-2xl flex flex-col"
        style={{ animation: 'dialog-in 0.15s ease-out' }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Project Advisor</span>
            <span className="text-[10px] text-muted-foreground/60">⌘L</span>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={handleClear}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1"
                title="대화 초기화"
              >
                Clear
              </button>
            )}
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground">
              <div className="text-2xl">🧭</div>
              <div className="text-sm">프로젝트 전체 맥락을 보고 답합니다</div>
              <div className="text-xs text-muted-foreground/70 max-w-[300px] leading-relaxed">
                &quot;다음 뭐부터 하면 좋겠어?&quot;<br />
                &quot;빠진 작업 없나?&quot;<br />
                &quot;이번 주 진행 상황 정리해줘&quot;<br />
                &quot;이 방향이 맞는지 검토해줘&quot;
              </div>
            </div>
          )}
          {messages.filter(m => m.role !== 'system').map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[92%] px-3 py-2 rounded-lg text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-accent text-white rounded-br-sm whitespace-pre-wrap'
                  : 'bg-muted text-foreground rounded-bl-sm chat-markdown'
              }`}>
                {msg.role === 'assistant'
                  ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  : msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-start">
              <div className="px-3 py-2 rounded-lg bg-muted text-foreground rounded-bl-sm">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex gap-1.5 px-3 py-3 border-t border-border flex-shrink-0">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="프로젝트에 대해 무엇이든 물어보세요…"
            rows={2}
            className="flex-1 bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground resize-none focus:border-primary focus:outline-none"
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="px-3 py-2 bg-accent text-white text-sm rounded-md
                       disabled:opacity-40 hover:bg-accent/80 transition-colors flex-shrink-0 self-end"
          >
            Send
          </button>
        </div>
      </div>

    </div>
  );
}
