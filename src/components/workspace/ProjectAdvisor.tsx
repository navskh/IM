'use client';

import AdvisorChat from '@/components/advisor/AdvisorChat';
import { mod } from '@/lib/platform';

export default function ProjectAdvisor({
  projectId,
  projectName,
  onClose,
}: {
  projectId: string;
  projectName?: string;
  onClose: () => void;
}) {
  return (
    <AdvisorChat
      basePath={`/api/projects/${projectId}/advisor`}
      title="Project Advisor"
      shortcutHint={`${mod()}L`}
      placeholder="프로젝트에 대해 무엇이든 물어보세요…"
      emptyIcon="🧭"
      emptyHints={[
        '프로젝트 전체 맥락을 보고 답합니다',
        '"다음 뭐부터 하면 좋겠어?"\n"빠진 작업 없나?"\n"이번 주 진행 상황 정리해줘"',
      ]}
      activityType="project-advisor"
      activityLabel={projectName ? `Advisor: ${projectName}` : 'Project Advisor'}
      onClose={onClose}
    />
  );
}
