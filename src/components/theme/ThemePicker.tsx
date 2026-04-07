'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from './ThemeProvider';

export default function ThemePicker() {
  const { theme, setTheme, themes } = useTheme();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        btnRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, updatePos]);

  return (
    <>
      <button
        ref={btnRef}
        className="theme-picker-btn"
        onClick={() => setOpen(!open)}
        title="테마 변경"
      >
        <span className="theme-picker-preview" style={{
          background: `hsl(${theme.colors['--primary']})`,
        }} />
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          className="theme-picker-dropdown"
          style={{ position: 'fixed', top: pos.top, right: pos.right }}
        >
          <div className="theme-picker-title">테마</div>
          <div className="theme-picker-grid">
            {themes.map((t) => (
              <button
                key={t.id}
                className={`theme-picker-item ${t.id === theme.id ? 'theme-picker-item-active' : ''}`}
                onClick={() => {
                  setTheme(t.id);
                  setOpen(false);
                }}
              >
                <div className="theme-picker-swatch">
                  <div style={{ background: `hsl(${t.colors['--background']})`, flex: 1 }} />
                  <div style={{ background: `hsl(${t.colors['--primary']})`, flex: 1 }} />
                  <div style={{ background: `hsl(${t.colors['--accent']})`, flex: 1 }} />
                </div>
                <span className="theme-picker-name">{t.emoji} {t.name}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
