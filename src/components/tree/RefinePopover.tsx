'use client';

import { useState, useRef, useEffect } from 'react';

interface IItemTree {
  id: string;
  title: string;
  description: string;
  item_type: string;
  priority: string;
  status: string;
  is_locked: boolean;
  is_pinned: boolean;
  children: IItemTree[];
}

interface RefinePopoverProps {
  itemId: string;
  projectId: string;
  title: string;
  description: string;
  onClose: () => void;
  onItemUpdate: (itemId: string, data: Record<string, unknown>) => void;
  onTreeRefresh: (tree: IItemTree[]) => void;
}

export default function RefinePopover({
  itemId,
  projectId,
  title,
  description,
  onClose,
  onItemUpdate,
  onTreeRefresh,
}: RefinePopoverProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setMessages(prev => [...prev, { role: 'user', text: trimmed }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/items/${itemId}/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [
          ...prev,
          { role: 'assistant', text: `"${data.title}"\n${data.description}` },
        ]);
        // Refresh the entire tree if structural changes were made
        if (data.tree) {
          onTreeRefresh(data.tree);
        } else {
          onItemUpdate(itemId, { title: data.title, description: data.description });
        }
      } else {
        const data = await res.json();
        setMessages(prev => [
          ...prev,
          { role: 'assistant', text: `오류: ${data.error || '다듬기에 실패했습니다'}` },
        ]);
      }
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: '오류: AI 연결에 실패했습니다' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="refine-popover">
      <div className="refine-header">
        <span className="text-xs font-medium">다듬기: {title}</span>
        <button onClick={onClose} className="refine-close">&times;</button>
      </div>

      {description && (
        <div className="refine-context">{description}</div>
      )}

      <div className="refine-messages">
        {messages.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-2">
            이 항목을 어떻게 다듬을지 알려주세요
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`memo-popover-bubble memo-popover-bubble-${m.role === 'user' ? 'user' : 'ai'}`}>
            {m.text.split('\n').map((line, j) => (
              <p key={j} className={j > 0 ? 'mt-1' : ''}>{line}</p>
            ))}
          </div>
        ))}
        {loading && (
          <div className="memo-popover-bubble memo-popover-bubble-ai chat-loading">
            <span className="dot" /><span className="dot" /><span className="dot" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="memo-popover-input-area">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="예: 하위 항목을 상세하게 추가해줘, 범위를 줄여줘..."
          rows={1}
          disabled={loading}
          className="memo-popover-input"
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || loading}
          className="memo-popover-send"
        >
          전송
        </button>
      </div>
    </div>
  );
}
