'use client';

import { useCallback, useRef } from 'react';

interface ResizeHandleProps {
  onResize: (topPercent: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export default function ResizeHandle({ onResize, containerRef }: ResizeHandleProps) {
  const isDragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const y = moveEvent.clientY - rect.top;
      const percent = Math.max(20, Math.min(80, (y / rect.height) * 100));
      onResize(percent);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, [onResize, containerRef]);

  return (
    <div className="resize-handle" onMouseDown={handleMouseDown}>
      <div className="resize-handle-bar" />
    </div>
  );
}
