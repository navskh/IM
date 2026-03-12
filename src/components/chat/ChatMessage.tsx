'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessageProps {
  role: 'assistant' | 'user';
  content: string;
  createdAt: string;
}

export default function ChatMessage({ role, content, createdAt }: ChatMessageProps) {
  const isAi = role === 'assistant';
  const time = new Date(createdAt).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`chat-message ${isAi ? 'chat-message-ai' : 'chat-message-user'}`}>
      <div className={`chat-bubble ${isAi ? 'chat-bubble-ai' : 'chat-bubble-user'}`}>
        {isAi ? (
          <div className="chat-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : (
          content.split('\n').map((line, i) => (
            <p key={i} className={i > 0 ? 'mt-1' : ''}>
              {line}
            </p>
          ))
        )}
      </div>
      <span className="chat-time">{time}</span>
    </div>
  );
}
