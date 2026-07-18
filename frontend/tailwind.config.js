/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#2563EB',
          blueSoft: '#EFF6FF',
          green: '#16A34A',
          greenSoft: '#F0FDF4',
          amber: '#D97706',
          amberSoft: '#FFFBEB',
          red: '#DC2626',
          redSoft: '#FEF2F2',
          purple: '#7C3AED',
          purpleSoft: '#F5F3FF',
          pink: '#DB2777',
          pinkSoft: '#FDF2F8',
          yellow: '#CA8A04',
          yellowSoft: '#FEFCE8',
        },
        surface: '#F8F9FC',
        card: '#FFFFFF',
        /* Adaptive Slate tokens — always written as light/dark pairs:
           bg-panel dark:bg-panel-dark, text-inkA dark:text-inkA-dark, etc. */
        canvas: { DEFAULT: '#F8FAFC', dark: '#0B0D0F' },
        panel: { DEFAULT: '#FFFFFF', dark: '#151719' },
        panel2: { DEFAULT: '#F1F5F9', dark: '#1D2023' },
        edge: { DEFAULT: '#E2E8F0', dark: '#26292D' },
        inkA: { DEFAULT: '#0F172A', dark: '#F1F5F9' },
        inkB: { DEFAULT: '#64748B', dark: '#9BA3AC' },
        accent: { DEFAULT: '#3B82F6', soft: '#EFF6FF' },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Segoe UI"', 'sans-serif'],
      },
      borderRadius: {
        xl: '8px',
        '2xl': '10px',
        '3xl': '12px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-md': '0 4px 12px rgba(0,0,0,0.08)',
        glow: '0 0 0 1px rgba(59,130,246,0.25), 0 4px 16px rgba(59,130,246,0.18)',
      },
      keyframes: {
        scan: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(100%)' }, // Need a fixed height or 100vh approximation
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        scan: 'scan 2s ease-in-out infinite',
        fadeIn: 'fadeIn 0.15s ease-out both',
        slideUp: 'slideUp 0.2s ease-out both',
      }
    },
  },
  plugins: [],
};
