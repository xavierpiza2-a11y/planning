import { useState, useEffect } from 'react';

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'canoshift_theme';

export function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  
  // 1. Check local storage manual preference
  const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
  if (saved === 'light' || saved === 'dark') {
    return saved;
  }

  // 2. Fallback to OS preference
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  // If OS prefers light or no preference
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }

  return 'dark';
}

export function applyThemeToDOM(theme: ThemeMode): void {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');

  if (theme === 'dark') {
    root.classList.add('dark');
    document.body.classList.add('dark');
    document.body.classList.remove('light');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', '#020617');
    }
  } else {
    root.classList.remove('dark');
    document.body.classList.remove('dark');
    document.body.classList.add('light');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', '#ffffff');
    }
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    applyThemeToDOM(theme);
  }, [theme]);

  // Listen to OS preference changes if user hasn't set a manual preference
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (!saved) {
        const newTheme: ThemeMode = e.matches ? 'dark' : 'light';
        setTheme(newTheme);
        applyThemeToDOM(newTheme);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_STORAGE_KEY, next);
      applyThemeToDOM(next);
      return next;
    });
  };

  const setExplicitTheme = (mode: ThemeMode) => {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
    setTheme(mode);
    applyThemeToDOM(mode);
  };

  return {
    theme,
    isDark: theme === 'dark',
    toggleTheme,
    setTheme: setExplicitTheme,
  };
}
