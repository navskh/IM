'use client';

import { useState, useRef, useEffect } from 'react';
import ChatMessage from './ChatMessage';

interface Message {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  created_at: string;
}

interface ChatPanelProps {
  messages: Message[];
  loading: boolean;
  onSendMessage: (message: string) => void;
}

export default function ChatPanel({ messages, loading, onSendMessage }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    onSendMessage(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h2 className="text-sm font-medium text-muted-foreground">AI 대화</h2>
        {messages.length > 0 && (
          <span className="text-xs text-muted-foreground">{messages.length}개 메시지</span>
        )}
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p>구조화를 실행하면 AI가 질문을 시작합니다</p>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              createdAt={msg.created_at}
            />
          ))
        )}
        {loading && (
          <div className="chat-message chat-message-ai">
            <div className="chat-bubble chat-bubble-ai chat-loading">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="답변을 입력하세요..."
          rows={1}
          disabled={loading}
          className="chat-input"
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || loading}
          className="chat-send-btn"
        >
          전송
        </button>
      </div>
    </div>
  );
}
