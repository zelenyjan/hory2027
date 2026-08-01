import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

export const THEME_KEY = 'hory-theme';
export const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Snow' },
  { value: 'dark', label: 'Night' },
  { value: 'system', label: 'System' },
];

export function readTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'dark' || stored === 'system' ? stored : 'light';
}

export function applyTheme(theme: Theme): void {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
    if (theme !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  return [theme, setTheme];
}
