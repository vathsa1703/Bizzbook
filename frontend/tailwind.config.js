/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
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
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Segoe UI"', 'sans-serif'],
      },
      borderRadius: {
        xl: '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-md': '0 4px 12px rgba(0,0,0,0.08)',
      },
      keyframes: {
        scan: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(100%)' }, // Need a fixed height or 100vh approximation
        }
      },
      animation: {
        scan: 'scan 2s ease-in-out infinite',
      }
    },
  },
  plugins: [],
};
