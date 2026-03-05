'use client';

interface StatusBadgeProps {
  status: string;
  onStatusChange: (status: string) => void;
  disabled?: boolean;
}

const statusConfig: Record<string, { icon: string; label: string; next: string }> = {
  pending: { icon: '\u{23F3}', label: '대기', next: 'in_progress' },
  in_progress: { icon: '\u{1F504}', label: '진행 중', next: 'done' },
  done: { icon: '\u{2705}', label: '완료', next: 'pending' },
};

export default function StatusBadge({ status, onStatusChange, disabled }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onStatusChange(config.next);
      }}
      disabled={disabled}
      className="status-badge"
      title={`${config.label} → 클릭하여 변경`}
    >
      <span>{config.icon}</span>
      <span className="status-badge-label">{config.label}</span>
    </button>
  );
}
