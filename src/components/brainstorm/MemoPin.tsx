'use client';

import { useState, useRef, useEffect } from 'react';

interface MemoPinProps {
  question: string;
  anchorText: string;
  top: number;
  left: number;
  loading?: boolean;
  onSendMessage?: (message: string) => void;
}

export default function MemoPin({ question, anchorText, top, left, loading, onSendMessage }: MemoPinProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [replies, setReplies] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus input when popover opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const handleClick = () => {
    setOpen(!open);
    setShowTooltip(false);
  };

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setReplies(prev => [...prev, { role: 'user', text: trimmed }]);
    setInput('');
    onSendMessage?.(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      ref={popoverRef}
      className="memo-pin"
      style={{ top: `${top}px`, left: `${left}px` }}
      onMouseEnter={() => !open && setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className="memo-pin-icon" onClick={handleClick}>&#x1F4CC;</span>

      {/* Hover tooltip (only when popover is closed) */}
      {showTooltip && !open && (
        <div className="memo-tooltip">
          <div className="memo-tooltip-anchor">&ldquo;{anchorText}&rdquo;</div>
          <div className="memo-tooltip-question">{question}</div>
        </div>
      )}

      {/* Click popover with inline chat */}
      {open && (
        <div className="memo-popover">
          <div className="memo-popover-anchor">&ldquo;{anchorText}&rdquo;</div>
          <div className="memo-popover-messages">
            <div className="memo-popover-bubble memo-popover-bubble-ai">{question}</div>
            {replies.map((r, i) => (
              <div key={i} className={`memo-popover-bubble memo-popover-bubble-${r.role === 'user' ? 'user' : 'ai'}`}>
                {r.text}
              </div>
            ))}
            {loading && (
              <div className="memo-popover-bubble memo-popover-bubble-ai chat-loading">
                <span className="dot" /><span className="dot" /><span className="dot" />
              </div>
            )}
          </div>
          <div className="memo-popover-input-area">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="답변 입력..."
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
      )}
    </div>
  );
}
