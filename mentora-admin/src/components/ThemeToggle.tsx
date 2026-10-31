import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { toggleTheme } from '../lib/theme';

export default function ThemeToggle() {
  const [isLight, setIsLight] = React.useState(
    () => document.documentElement.getAttribute('data-theme') === 'light'
  );

  const handleToggle = () => {
    const next = toggleTheme();
    setIsLight(next === 'light');
  };

  return (
    <button
      onClick={handleToggle}
      title={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
      className="flex items-center justify-center w-9 h-9 rounded-xl border border-border text-textMuted hover:text-primary hover:border-primary/40 hover:bg-primary/10 transition-colors cursor-pointer"
    >
      {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </button>
  );
}
