/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Global accent palette (brand red)
        red: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#e72129',
          600: '#c61d24',
          700: '#a8181f',
          800: '#8b141a',
          900: '#741116',
          950: '#3f070b',
        },
        orange: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#e72129',
          600: '#c61d24',
          700: '#a8181f',
          800: '#8b141a',
          900: '#741116',
          950: '#3f070b',
        },
        primary: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#e72129',
          600: '#c61d24',
          700: '#a8181f',
          800: '#8b141a',
          900: '#741116',
          950: '#3f070b',
        },
        // LokSwami B3 Centralized Design Tokens
        brand: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#e72129', // Canonical LokSwami Red
          600: '#c61d24', // Brand Hover
          700: '#a8181f', // Brand Active
          800: '#8b141a',
          900: '#741116',
          950: '#3f070b',
        },
        'brand-hover': '#c61d24',
        'brand-active': '#a8181f',
        breaking: '#dc2626',
        // Normalized Editorial Surfaces
        editorial: {
          dark: {
            base: '#0e0e12',
            elevated: '#16161c',
            overlay: '#1f1f26',
            muted: '#272731',
            border: '#2e2e38',
            'border-strong': '#3f3f4c',
          },
          light: {
            base: '#ffffff',
            elevated: '#ffffff',
            muted: '#f8f9fa',
            border: '#e4e4e7',
            'border-strong': '#d4d4d8',
          },
        },
        // Named colors for clarity
        'spanish-red': '#e72129',
        'guardsman-red': '#c61d24',
        'lokswami-red': '#e72129',
        'lokswami-black': '#0b0b0f',
        'lokswami-surface': '#18181b',
        'lokswami-border': '#2f2f35',
        'lokswami-white': '#f4f4f5',
        'lokswami-text-secondary': '#a1a1aa',
        'lokswami-text-muted': '#71717a',
        'raisin-black': '#242024',
        'gainsboro': '#DDDDDD',
        'white-gray': '#F3F4F5',
        sidebar: {
          bg: '#111827',
          text: '#D1D5DB',
          active: '#1F2937',
        },
        background: {
          light: '#F3F4F5',
          dark: '#242024',
        },
        success: {
          500: '#10B981',
        },
        danger: {
          500: '#e72129',
        },
        warning: {
          500: '#F59E0B',
        },
      },
      screens: {
        xs: '360px',
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        wide: '1440px',
        '2xl': '1536px',
      },
      maxWidth: {
        reading: '68ch',
        'article-container': '52rem',
        'page-narrow': '48rem',
        'page-standard': '72rem',
        'page-wide': '86rem',
      },
      borderRadius: {
        'editorial-xs': '0.25rem',
        'editorial-sm': '0.375rem',
        'editorial-md': '0.5rem',
        'editorial-lg': '0.75rem',
        'editorial-xl': '1rem',
        'editorial-pill': '9999px',
      },
      boxShadow: {
        'editorial-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        editorial: '0 2px 6px -1px rgba(0, 0, 0, 0.08), 0 1px 4px -1px rgba(0, 0, 0, 0.04)',
        'editorial-md': '0 6px 16px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04)',
        'editorial-lg': '0 12px 28px -4px rgba(0, 0, 0, 0.12), 0 4px 10px -2px rgba(0, 0, 0, 0.06)',
      },
      fontFamily: {
        sans: [
          'var(--font-news-ui)',
          'Noto Sans Devanagari',
          'Noto Sans',
          'Mangal',
          'Kohinoor Devanagari',
          'system-ui',
          'sans-serif',
        ],
        hindi: [
          'Noto Sans Devanagari',
          'Mangal',
          'Kohinoor Devanagari',
          'sans-serif',
        ],
        english: [
          'Noto Sans',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        marquee: 'marquee 25s linear infinite',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-100%)' },
        },
      },
    },
  },
  plugins: [],
};
