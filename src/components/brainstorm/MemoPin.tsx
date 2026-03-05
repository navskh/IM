'use client';

import { useState } from 'react';

interface MemoPinProps {
  question: string;
  anchorText: string;
  top: number;
  left: number;
}

export default function MemoPin({ question, anchorText, top, left }: MemoPinProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className="memo-pin"
      style={{ top: `${top}px`, left: `${left}px` }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className="memo-pin-icon">&#x1F4CC;</span>
      {showTooltip && (
        <div className="memo-tooltip">
          <div className="memo-tooltip-anchor">&ldquo;{anchorText}&rdquo;</div>
          <div className="memo-tooltip-question">{question}</div>
        </div>
      )}
    </div>
  );
}
