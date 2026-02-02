import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7ff',
          100: '#d7ebff',
          200: '#afd5ff',
          300: '#7ab8ff',
          400: '#4497ff',
          500: '#1f8bff',
          600: '#1169db',
          700: '#0d4fb2',
          800: '#0d418a',
          900: '#0f356c',
          950: '#071e42'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'Inter', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        brand: '0 18px 30px rgba(0, 77, 216, 0.20)'
      },
      backgroundImage: {
        'hero-mesh':
          'radial-gradient(65% 85% at 20% 20%, rgba(31, 139, 255, 0.65), transparent 70%), radial-gradient(55% 95% at 80% 15%, rgba(0, 80, 216, 0.7), transparent 60%), radial-gradient(75% 85% at 50% 90%, rgba(61, 220, 255, 0.4), transparent 80%)'
      }
    }
  },
  plugins: []
}

export default config
