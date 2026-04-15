'use client';

import type { TaskStatus } from '@/types';
import { ACTIVE_STATUSES, LEGACY_STATUSES } from '@/types';

type StatusMeta = { key: TaskStatus; label: string; icon: string; color: string };

const ALL: StatusMeta[] = [
  { key: 'idea',      label: 'Idea',      icon: '\u{1F4A1}', color: 'text-muted-foreground' },
  { key: 'doing',     label: 'Doing',     icon: '\u{1F525}', color: 'text-primary' },
  { key: 'writing',   label: 'Writing',   icon: '\u{270F}\u{FE0F}', color: 'text-warning' },
  { key: 'submitted', label: 'Submitted', icon: '\u{1F680}', color: 'text-primary' },
  { key: 'testing',   label: 'Testing',   icon: '\u{1F9EA}', color: 'text-accent' },
  { key: 'done',      label: 'Done',      icon: '\u{2705}',  color: 'text-success' },
  { key: 'problem',   label: 'Problem',   icon: '\u{1F534}', color: 'text-destructive' },
];

function meta(key: TaskStatus): StatusMeta {
  return ALL.find(s => s.key === key) ?? ALL[0];
}

export default function StatusFlow({
  status,
  onChange,
}: {
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
}) {
  const isLegacy = LEGACY_STATUSES.includes(status);
  const current = meta(status);

  return (
    <div className="flex items-center gap-1">
      {isLegacy && (
        <span
          title={`Legacy: ${current.label} (클릭해서 새 상태로 이동)`}
          className={`px-2 py-1 rounded text-xs ${current.color} bg-muted/50 border border-dashed border-muted-foreground/30 mr-1`}
        >
          {current.icon} {current.label}
        </span>
      )}
      {ACTIVE_STATUSES.map((key) => {
        const s = meta(key);
        const active = status === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            title={s.label}
            className={`px-2 py-1 rounded text-base transition-all ${
              active
                ? `${s.color} bg-muted scale-110`
                : 'opacity-40 hover:opacity-80'
            }`}
          >
            {s.icon}
          </button>
        );
      })}
    </div>
  );
}

export function statusIcon(status: TaskStatus): string {
  return meta(status).icon;
}
