import path from 'path';
import type { Config } from 'tailwindcss';

// Пути только через path.posix — иначе на Windows Tailwind получает \ и не находит файлы / матчит node_modules
const contentPaths = [
  path.posix.join('.', 'app', '**', '*.{js,ts,jsx,tsx,mdx}'),
  path.posix.join('.', 'components', '**', '*.{js,ts,jsx,tsx,mdx}'),
  path.posix.join('.', 'lib', '**', '*.{js,ts,jsx,tsx,mdx}'),
  path.posix.join('.', 'hooks', '**', '*.{js,ts,jsx,tsx,mdx}'),
  path.posix.join('.', 'contexts', '**', '*.{js,ts,jsx,tsx,mdx}'),
  path.posix.join('.', 'stores', '**', '*.{js,ts,jsx,tsx,mdx}'),
  path.posix.join('.', 'collab', '**', '*.{js,ts,jsx,tsx,mdx}'),
  path.posix.join('.', 'src', '**', '*.{js,ts,jsx,tsx,mdx}'),
];

const config: Config = {
  content: contentPaths,
  theme: {
    extend: {
      colors: {
        // Background colors
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-tertiary': 'var(--bg-tertiary)',
        'bg-quaternary': 'var(--bg-quaternary)',
        'bg-hover': 'var(--bg-hover)',
        'bg-active': 'var(--bg-active)',
        // Semantic v2
        'surface-panel': 'var(--surface-panel)',
        'surface-elevated': 'var(--surface-elevated)',
        'surface-skeleton': 'var(--surface-skeleton)',
        'interactive-hover': 'var(--interactive-hover)',
        'interactive-active': 'var(--interactive-active)',
        
        // Border colors
        'border-primary': 'var(--border-primary)',
        'border-secondary': 'var(--border-secondary)',
        'border-subtle': 'var(--border-subtle)',
        'border-default': 'var(--border-default)',
        
        // Text colors
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        'text-names': 'var(--text-names)',
        'text-heading': 'var(--text-heading)',
        'text-body': 'var(--text-body)',
        
        // Green interactive
        'green-primary': 'var(--green-primary)',
        'green-hover': 'var(--green-hover)',
        'green-active': 'var(--green-active)',
        'green-dark': 'var(--green-dark)',
        
        // Status colors
        'danger': 'var(--danger)',
        'warning': 'var(--warning)',
        'info': 'var(--info)',
        
        // Presence status
        'status-online': 'var(--status-online)',
        'status-idle': 'var(--status-idle)',
        'status-dnd': 'var(--status-dnd)',
        'status-offline': 'var(--status-offline)',
        'status-presence-online': 'var(--status-presence-online)',
        
        // Legacy compatibility
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      spacing: {
        0: 'var(--spacing-0)',
        1: 'var(--spacing-1)',
        2: 'var(--spacing-2)',
        3: 'var(--spacing-3)',
        4: 'var(--spacing-4)',
        5: 'var(--spacing-5)',
        6: 'var(--spacing-6)',
        8: 'var(--spacing-8)',
        10: 'var(--spacing-10)',
        12: 'var(--spacing-12)',
      },
      boxShadow: {
        'green-glow': '0 0 0 3px var(--green-glow)',
        'green-glow-sm': '0 0 8px var(--green-glow)',
        'green-glow-lg': '0 0 16px var(--green-glow)',
        'elev-1': 'var(--shadow-elev-1)',
        'elev-2': 'var(--shadow-elev-2)',
        'elev-3': 'var(--shadow-elev-3)',
        'focus': 'var(--shadow-focus)',
      },
      zIndex: {
        base: 'var(--z-base)',
        dropdown: 'var(--z-dropdown)',
        popover: 'var(--z-popover)',
        modal: 'var(--z-modal)',
        toast: 'var(--z-toast)',
      },
      animation: {
        'pulse-green': 'pulse-green 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        'pulse-green': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
