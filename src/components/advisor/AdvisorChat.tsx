'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { IProjectConversation } from '@/types';
import { registerAiActivity, unregisterAiActivity } from '@/lib/ai-activity';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function AdvisorChat({
  basePath,
  title,
  shortcutHint,
  placeholder,
  emptyIcon,
  emptyHints,
  activityType,
  activityLabel,
  onClose,
}: {
  basePath: string;
  title: string;
  shortcutHint: string;
  placeholder: string;
  emptyIcon: string;
  emptyHints: string[];
  activityType: 'project-advisor' | 'global-advisor';
  activityLabel: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<IProjectConversation[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(basePath);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setMessages(data);
    } catch { /* silent */ }
  }, [basePath]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, []);

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
    const actId = `${activityType}-${Date.now()}`;
    registerAiActivity({ id: actId, type: activityType, label: activityLabel, startedAt: Date.now() });
    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [...prev, { id: tempId, project_id: '', role: 'user', content: text, created_at: new Date().toISOString() }]);
    try {
      const res = await fetch(basePath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev.filter(m => m.id !== tempId), data.userMessage, data.aiMessage]);
      }
    } catch { /* silent */ }
    unregisterAiActivity(actId);
    setLoading(false);
    inputRef.current?.focus();
  }, [input, loading, basePath, activityType, activityLabel]);

  const handleClear = useCallback(async () => {
    await fetch(basePath, { method: 'DELETE' });
    setMessages([]);
    inputRef.current?.focus();
  }, [basePath]);

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" style={{ backdropFilter: 'blur(2px)' }} />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[560px] max-w-[90vw] h-[80vh] max-h-[700px] bg-card border border-border rounded-xl shadow-2xl flex flex-col animate-dialog-in"
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            <span className="text-[10px] text-muted-foreground/60">{shortcutHint}</span>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button onClick={handleClear} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1">Clear</button>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none">×</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground">
              <div className="text-2xl">{emptyIcon}</div>
              {emptyHints.map((h, i) => (
                <div key={i} className={i === 0 ? 'text-sm' : 'text-xs text-muted-foreground/70 max-w-[300px] leading-relaxed'}>{h}</div>
              ))}
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

        <div className="flex gap-1.5 px-3 py-3 border-t border-border flex-shrink-0">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={placeholder}
            rows={2}
            className="flex-1 bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground resize-none focus:border-primary focus:outline-none"
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="px-3 py-2 bg-accent text-white text-sm rounded-md disabled:opacity-40 hover:bg-accent/80 transition-colors flex-shrink-0 self-end"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
