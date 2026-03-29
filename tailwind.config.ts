import type { Config } from 'tailwindcss';
import tailwindAnimate from 'tailwindcss-animate';
import typography from '@tailwindcss/typography';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        glass: {
          DEFAULT: 'hsl(var(--glass-bg))',
          border: 'hsl(var(--glass-border))',
          highlight: 'hsl(var(--glass-highlight))',
        },
        state: {
          hover: 'hsl(var(--state-hover))',
          pressed: 'hsl(var(--state-pressed))',
          focus: 'hsl(var(--state-focus))',
        },
      },
      backgroundImage: {
        'gradient-theme': 'linear-gradient(135deg, hsl(var(--gradient-primary)) 0%, hsl(var(--gradient-secondary)) 100%)',
        'gradient-theme-subtle': 'linear-gradient(135deg, hsl(var(--gradient-primary) / 0.2) 0%, hsl(var(--gradient-secondary) / 0.2) 100%)',
      },
      boxShadow: {
        'elevation-1': 'var(--elevation-1)',
        'elevation-2': 'var(--elevation-2)',
        'elevation-3': 'var(--elevation-3)',
        'elevation-4': 'var(--elevation-4)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'ripple-effect': {
          '0%': { opacity: '0.2', transform: 'scale(0)' },
          '100%': { opacity: '0', transform: 'scale(2.5)' },
        },
      },
      animation: {
        'ripple-effect': 'ripple-effect 0.6s ease-out',
      },
    },
  },
  plugins: [tailwindAnimate, typography],
} satisfies Config;
