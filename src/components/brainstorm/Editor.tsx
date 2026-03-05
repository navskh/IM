'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import MemoPin from './MemoPin';

interface Memo {
  id: string;
  anchor_text: string;
  question: string;
  is_resolved: boolean;
}

interface EditorProps {
  projectId: string;
  onContentChange: (content: string) => void;
  memos?: Memo[];
}

interface PinPosition {
  memo: Memo;
  top: number;
  left: number;
}

export default function Editor({ projectId, onContentChange, memos = [] }: EditorProps) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pinPositions, setPinPositions] = useState<PinPosition[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const structureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Load brainstorm content
  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/projects/${projectId}/brainstorm`);
      const data = await res.json();
      setContent(data.content || '');
      setLoaded(true);
    };
    load();
  }, [projectId]);

  // Calculate pin positions when memos or content change
  useEffect(() => {
    if (!textareaRef.current || !content) {
      setPinPositions([]);
      return;
    }

    const textarea = textareaRef.current;
    const unresolvedMemos = memos.filter(m => !m.is_resolved);
    const positions: PinPosition[] = [];

    for (const memo of unresolvedMemos) {
      const idx = content.indexOf(memo.anchor_text);
      if (idx === -1) continue;

      // Calculate approximate position based on character index
      const textBefore = content.substring(0, idx);
      const lines = textBefore.split('\n');
      const lineNumber = lines.length - 1;
      const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 22;
      const paddingTop = parseFloat(getComputedStyle(textarea).paddingTop) || 16;

      const top = paddingTop + lineNumber * lineHeight;
      const left = textarea.clientWidth - 28;

      positions.push({ memo, top, left });
    }

    setPinPositions(positions);
  }, [memos, content]);

  const saveContent = useCallback(async (text: string) => {
    setSaving(true);
    await fetch(`/api/projects/${projectId}/brainstorm`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    });
    setSaving(false);
  }, [projectId]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);

    // Auto-save with 1s debounce
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveContent(newContent);
    }, 1000);

    // Trigger AI structuring with 3s debounce
    if (structureTimerRef.current) clearTimeout(structureTimerRef.current);
    if (newContent.trim()) {
      structureTimerRef.current = setTimeout(() => {
        onContentChange(newContent);
      }, 3000);
    }
  };

  // Sync scroll between textarea and overlay
  const handleScroll = () => {
    if (textareaRef.current && overlayRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

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
        <h2 className="text-sm font-medium text-muted-foreground">브레인스토밍</h2>
        <span className="text-xs text-muted-foreground">
          {saving ? '저장 중...' : content ? '저장됨' : ''}
        </span>
      </div>
      <div className="editor-container">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onScroll={handleScroll}
          placeholder={`자유롭게 아이디어를 적어보세요...

예시:
- 소셜 로그인을 활용한 사용자 인증
- 분석 차트가 포함된 대시보드
- 알림 시스템 필요 (푸시 + 이메일)
- 다크 모드 지원
- 모바일 반응형 디자인 중요`}
          className="flex-1 w-full p-4 bg-transparent resize-none text-foreground
                     placeholder:text-muted-foreground/40 font-mono text-sm leading-relaxed"
          spellCheck={false}
        />
        {pinPositions.length > 0 && (
          <div ref={overlayRef} className="memo-overlay">
            {pinPositions.map((pin) => (
              <MemoPin
                key={pin.memo.id}
                question={pin.memo.question}
                anchorText={pin.memo.anchor_text}
                top={pin.top}
                left={pin.left}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
