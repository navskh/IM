'use client';

import type { TaskStatus } from '@/types';

const STATUSES: { key: TaskStatus; label: string; icon: string; color: string }[] = [
  { key: 'idea', label: 'Idea', icon: '\u{1F4A1}', color: 'text-muted-foreground' },
  { key: 'writing', label: 'Writing', icon: '\u{270F}\u{FE0F}', color: 'text-warning' },
  { key: 'submitted', label: 'Submitted', icon: '\u{1F680}', color: 'text-primary' },
  { key: 'testing', label: 'Testing', icon: '\u{1F9EA}', color: 'text-accent' },
  { key: 'done', label: 'Done', icon: '\u{2705}', color: 'text-success' },
  { key: 'problem', label: 'Problem', icon: '\u{1F534}', color: 'text-destructive' },
];

export default function StatusFlow({
  status,
  onChange,
}: {
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {STATUSES.map((s) => (
        <button
          key={s.key}
          onClick={() => onChange(s.key)}
          title={s.label}
          className={`px-2 py-1 rounded text-base transition-all ${
            status === s.key
              ? `${s.color} bg-muted scale-110`
              : 'opacity-40 hover:opacity-80'
          }`}
        >
          {s.icon}
        </button>
      ))}
    </div>
  );
}

export function statusIcon(status: TaskStatus): string {
  return STATUSES.find(s => s.key === status)?.icon ?? '';
}
