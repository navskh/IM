'use client';

import { useEffect, useState } from 'react';
import AdvisorChat from './AdvisorChat';

export default function GlobalAdvisorLayer() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;

  return (
    <AdvisorChat
      basePath="/api/global-advisor"
      title="Global Advisor"
      shortcutHint="⌘J"
      placeholder="전체 워크스페이스에 대해 물어보세요…"
      emptyIcon="🌐"
      emptyHints={[
        '모든 프로젝트를 조망하고 답합니다',
        '"전체 진행 상황 요약해줘"\n"어떤 프로젝트가 제일 급해?"\n"이번 주 뭐 해야 돼?"',
      ]}
      activityType="global-advisor"
      activityLabel="Global Advisor"
      onClose={() => setOpen(false)}
    />
  );
}
