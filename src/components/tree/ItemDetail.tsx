'use client';

import { useState, useEffect } from 'react';

interface ItemDetailProps {
  itemId: string;
  projectId: string;
  title: string;
  description: string;
  itemType: string;
  priority: string;
  status: string;
  isLocked: boolean;
  depth: number;
}

interface IPrompt {
  id: string;
  content: string;
  prompt_type: string;
  version: number;
}

const typeLabels: Record<string, string> = {
  feature: '기능',
  task: '작업',
  bug: '버그',
  idea: '아이디어',
  note: '메모',
};

const priorityLabels: Record<string, string> = {
  high: '높음',
  medium: '보통',
  low: '낮음',
};

const statusLabels: Record<string, string> = {
  pending: '대기',
  in_progress: '진행 중',
  done: '완료',
};

export default function ItemDetail({
  itemId,
  projectId,
  title,
  description,
  itemType,
  priority,
  status,
  isLocked,
  depth,
}: ItemDetailProps) {
  const [prompt, setPrompt] = useState<IPrompt | null>(null);
  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  // Load existing prompt
  useEffect(() => {
    const loadPrompt = async () => {
      setLoadingPrompt(true);
      const res = await fetch(`/api/projects/${projectId}/items/${itemId}/prompt`);
      if (res.ok) {
        setPrompt(await res.json());
      }
      setLoadingPrompt(false);
    };
    loadPrompt();
  }, [itemId, projectId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/items/${itemId}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setPrompt(await res.json());
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/items/${itemId}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      });
      if (res.ok) {
        setPrompt(await res.json());
        setEditing(false);
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div
      className="item-detail"
      style={{ marginLeft: `${depth * 20 + 8}px` }}
    >
      <p className="text-muted-foreground mb-2 text-xs">{description || '설명 없음'}</p>

      <div className="flex gap-3 text-xs text-muted-foreground mb-3">
        <span>유형: {typeLabels[itemType] || itemType}</span>
        <span>우선순위: {priorityLabels[priority] || priority}</span>
        <span>상태: {statusLabels[status] || status}</span>
        <span>잠금: {isLocked ? '잠금' : '해제'}</span>
      </div>

      {/* Prompt section */}
      <div className="prompt-section">
        <div className="prompt-header">
          <span className="text-xs font-medium text-muted-foreground">프롬프트</span>
          <div className="flex gap-1">
            {prompt && (
              <>
                <button onClick={handleCopy} className="prompt-action-btn" title="복사">
                  {copied ? '복사됨' : '복사'}
                </button>
                <button
                  onClick={() => { setEditing(!editing); setEditContent(prompt.content); }}
                  className="prompt-action-btn"
                  title="수정"
                >
                  {editing ? '취소' : '수정'}
                </button>
              </>
            )}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="prompt-action-btn prompt-generate-btn"
              title={prompt ? '재생성' : '생성'}
            >
              {generating ? '생성 중...' : prompt ? '재생성' : '생성'}
            </button>
          </div>
        </div>

        {loadingPrompt ? (
          <p className="text-xs text-muted-foreground">로딩 중...</p>
        ) : editing ? (
          <div className="prompt-edit">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="prompt-edit-textarea"
              rows={4}
            />
            <button
              onClick={handleSaveEdit}
              disabled={generating}
              className="prompt-action-btn prompt-generate-btn mt-1"
            >
              저장
            </button>
          </div>
        ) : prompt ? (
          <div className="prompt-content">
            {prompt.content}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/60">
            아직 프롬프트가 없습니다. &quot;생성&quot; 버튼을 클릭하세요.
          </p>
        )}

        {prompt && (
          <div className="text-[10px] text-muted-foreground/40 mt-1">
            v{prompt.version} · {prompt.prompt_type === 'manual' ? '수동' : '자동'}
          </div>
        )}
      </div>
    </div>
  );
}
