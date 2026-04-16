'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import NoteEditor from '@/components/task/NoteEditor';

interface EditorProps {
  projectId: string;
  onCollapse?: () => void;
}

export default function Editor({ projectId, onCollapse }: EditorProps) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/projects/${projectId}/brainstorm`);
      const data = await res.json();
      setContent(data.content || '');
      setLoaded(true);
    };
    load();
  }, [projectId]);

  const saveContent = useCallback(async (text: string) => {
    setSaving(true);
    await fetch(`/api/projects/${projectId}/brainstorm`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    });
    setSaving(false);
  }, [projectId]);

  const handleChange = useCallback((newContent: string) => {
    setContent(newContent);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveContent(newContent);
    }, 1000);
  }, [saveContent]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        로딩 중...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <h2 className="text-sm font-medium text-muted-foreground">BRAINSTORMING</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {saving ? '저장 중...' : content ? '저장됨' : ''}
          </span>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="text-muted-foreground hover:text-foreground transition-colors text-xs px-1"
              title="접기 (B)"
            >
              «
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <NoteEditor
          value={content}
          onChange={handleChange}
          placeholder={`자유롭게 아이디어를 적어보세요...

예시:
- 소셜 로그인을 활용한 사용자 인증
- 분석 차트가 포함된 대시보드
- 알림 시스템 필요 (푸시 + 이메일)
- 다크 모드 지원
- 모바일 반응형 디자인 중요`}
        />
      </div>
    </div>
  );
}
