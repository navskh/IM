'use client';

interface LockToggleProps {
  isLocked: boolean;
  onToggle: (locked: boolean) => void;
  disabled?: boolean;
}

export default function LockToggle({ isLocked, onToggle, disabled }: LockToggleProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle(!isLocked);
      }}
      disabled={disabled}
      className="lock-toggle"
      title={isLocked ? '잠금 해제' : '잠금'}
    >
      {isLocked ? '\u{1F510}' : '\u{1F513}'}
    </button>
  );
}
