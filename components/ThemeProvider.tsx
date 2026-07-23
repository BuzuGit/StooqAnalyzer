'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Theme = 'dark' | 'light';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

function applyThemeClass(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Default is dark; the inline script in <head> already set the class to avoid
  // a flash, so we read back what it decided on mount.
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const stored =
      typeof window !== 'undefined'
        ? (localStorage.getItem('theme') as Theme | null)
        : null;
    const initial: Theme = stored === 'light' ? 'light' : 'dark';
    setTheme(initial);
    applyThemeClass(initial);
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('theme', next);
      } catch {
        /* ignore storage errors */
      }
      applyThemeClass(next);
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
