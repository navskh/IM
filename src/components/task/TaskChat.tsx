'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ITaskConversation, TaskStatus } from '@/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const POLL_INTERVAL = 3000; // Poll every 3s when task is testing

function notifyAiResponse(preview: string) {
  // Only notify when window/tab is not focused
  if (document.hasFocus()) return;

  if (Notification.permission === 'granted') {
    new Notification('IM - AI Response', {
      body: preview.slice(0, 120),
      icon: '/icon-192.png',
    });
  }
}

export default function TaskChat({
  basePath,
  taskStatus,
  onInsertToNote,
  onChatStateChange,
}: {
  basePath: string;
  taskStatus?: TaskStatus;
  onInsertToNote: (content: string) => void;
  onChatStateChange?: (state: 'idle' | 'loading' | 'done') => void;
}) {
  const [messages, setMessages] = useState<ITaskConversation[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const basePathRef = useRef(basePath);

  // Track basePath changes — reset state and abort stale responses
  useEffect(() => {
    basePathRef.current = basePath;
    setMessages([]);
    setLoading(false);
  }, [basePath]);

  // Request notification permission on mount
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const fetchMessages = useCallback(() => {
    const currentPath = basePath;
    fetch(`${currentPath}/chat`)
      .then(r => r.json())
      .then(data => {
        if (basePathRef.current !== currentPath) return;
        if (Array.isArray(data)) setMessages(data);
      });
  }, [basePath]);

  // Initial load
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Auto-poll when task is testing (watcher is running)
  useEffect(() => {
    if (taskStatus !== 'testing') return;
    const interval = setInterval(fetchMessages, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [taskStatus, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const sendPath = basePath;
    setInput('');
    setLoading(true);
    onChatStateChange?.('loading');

    // Optimistic user message
    const tempId = `temp-${Date.now()}`;
    const userMsg: ITaskConversation = {
      id: tempId, task_id: '', role: 'user', content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await fetch(`${sendPath}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (basePathRef.current !== sendPath) {
        // Task switched, but response arrived — notify done
        onChatStateChange?.('done');
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => {
          const withoutTemp = prev.filter(m => m.id !== tempId);
          return [...withoutTemp, data.userMessage, data.aiMessage];
        });
        if (data.aiMessage?.content) {
          notifyAiResponse(data.aiMessage.content);
        }
      }
    } catch { /* silent */ }
    if (basePathRef.current === sendPath) {
      setLoading(false);
      inputRef.current?.focus();
    }
    onChatStateChange?.('done');
  }, [input, loading, basePath, onChatStateChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Note Assistant</span>
        {taskStatus === 'testing' && (
          <span className="flex items-center gap-1.5 text-xs text-warning">
            <span className="inline-block w-2 h-2 rounded-full bg-warning animate-pulse" />
            Executing...
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
        {messages.length === 0 && !loading && (
          <div className="text-sm text-muted-foreground text-center py-4">
            노트 작성을 도와드립니다. 질문하거나 &quot;이 부분 정리해줘&quot; 같이 요청해보세요
          </div>
        )}
        {messages.filter(msg => msg.content).map((msg) => {
          const isProgress = msg.role === 'assistant' && msg.content.startsWith('[진행 중]');
          return (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              {isProgress && (
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-warning mb-0.5 pl-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                  Watch 실행 중 · 실시간 출력
                </div>
              )}
              <div className={`max-w-[90%] px-3 py-2 rounded-lg text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-accent text-white rounded-br-sm whitespace-pre-wrap'
                  : isProgress
                    ? 'bg-warning/10 text-foreground rounded-bl-sm chat-markdown border border-warning/30'
                    : 'bg-muted text-foreground rounded-bl-sm chat-markdown'
              }`}>
                {msg.role === 'assistant'
                  ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  : msg.content}
              </div>
              {msg.role === 'assistant' && !isProgress && (
                <button
                  onClick={() => onInsertToNote(msg.content)}
                  className="text-xs text-muted-foreground hover:text-primary mt-0.5 px-1 transition-colors"
                >
                  ↓ 노트에 삽입
                </button>
              )}
            </div>
          );
        })}
        {loading && (
          <div className="flex gap-1 px-2 py-2">
            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-1.5 px-2 py-2 border-t border-border">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask AI..."
          rows={1}
          className="flex-1 bg-input border border-border rounded-md px-3 py-2 text-sm
                     text-foreground resize-none focus:border-primary focus:outline-none"
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          className="px-3 py-2 bg-accent text-white text-sm rounded-md
                     disabled:opacity-40 hover:bg-accent/80 transition-colors flex-shrink-0"
        >
          Send
        </button>
      </div>
    </div>
  );
}
