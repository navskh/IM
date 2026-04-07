'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { themes, getThemeById, DEFAULT_THEME_ID, type ITheme } from './themes';

const STORAGE_KEY = 'im-theme';

interface IThemeContext {
  theme: ITheme;
  setTheme: (id: string) => void;
  themes: ITheme[];
}

const ThemeContext = createContext<IThemeContext | null>(null);

function applyTheme(theme: ITheme) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(key, value);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Always start with default theme to avoid hydration mismatch
  const [theme, setThemeState] = useState<ITheme>(getThemeById(DEFAULT_THEME_ID));
  const [mounted, setMounted] = useState(false);

  // Load saved theme after mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const t = getThemeById(saved);
      setThemeState(t);
      applyTheme(t);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) applyTheme(theme);
  }, [theme, mounted]);

  const setTheme = useCallback((id: string) => {
    const t = getThemeById(id);
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
