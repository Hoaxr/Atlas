/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // --- Atlas brand colors ---
      colors: {
        atlas: {
          50:  '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
          950: '#083344',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },

      // --- Reusable animations ---
      animation: {
        'fade-in':  'fadeIn 0.3s ease-out',
        'fade-in-fast': 'fadeIn 0.15s ease-out',
        'slide-up':   'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.2s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
      },

      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%':   { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.6' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 12px rgba(6,182,212,0.2)' },
          '50%':      { boxShadow: '0 0 24px rgba(6,182,212,0.4)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },

      // --- Custom shadows ---
      boxShadow: {
        'atlas-glow':   '0 0 15px rgba(6,182,212,0.15)',
        'atlas-glow-lg':'0 0 25px rgba(6,182,212,0.2)',
        'trailer':      '0 0 50px rgba(0,0,0,0.5)',
        'card':         '0 4px 20px rgba(0,0,0,0.08)',
        'card-hover':   '0 8px 30px rgba(0,0,0,0.12)',
      },

      // --- Drop shadows ---
      dropShadow: {
        'atlas-glow': '0 0 12px rgba(6,182,212,0.4)',
      },
    },
  },
  plugins: [],
};
