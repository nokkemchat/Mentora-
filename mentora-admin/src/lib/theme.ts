export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'mentora-theme';

export function getStoredTheme(): Theme | null {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return t === 'dark' || t === 'light' ? t : null;
  } catch {
    return null;
  }
}

export function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

/** Runs before first paint: stored preference, else the system preference. */
export function initTheme(): Theme {
  const theme = getStoredTheme() || systemTheme();
  applyTheme(theme);
  return theme;
}

export function setTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage unavailable — theme still applies for this session */
  }
}

export function toggleTheme(): Theme {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}
