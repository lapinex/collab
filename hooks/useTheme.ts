import { useState, useEffect } from 'react';

export type Theme = 'collab' | 'classic' | 'harmony' | 'neutral';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('collab');

  useEffect(() => {
    // Load theme from localStorage or user settings
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    if (savedTheme && ['collab', 'classic', 'harmony', 'neutral'].includes(savedTheme)) {
      setTheme(savedTheme);
      applyTheme(savedTheme);
    } else {
      applyTheme(theme);
    }
  }, []);

  const applyTheme = (newTheme: Theme) => {
    const root = document.documentElement;
    root.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const changeTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    applyTheme(newTheme);

    // Save to user settings via API
    fetch('/api/users/settings', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ theme: newTheme }),
    }).catch((error) => {
      console.error('Failed to save theme:', error);
    });
  };

  return {
    theme,
    changeTheme,
  };
}
