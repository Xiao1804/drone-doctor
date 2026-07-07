import typography from '@tailwindcss/typography'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand': {
          orange: '#FF6B00',
          'orange-hover': '#FF8533',
        }
      },
      fontFamily: {
        sans: [
          'Inter',
          'SF Pro Display',
          'PingFang SC',
          'Microsoft YaHei',
          'sans-serif'
        ],
        mono: ['SF Mono', 'Monaco', 'monospace']
      }
    },
  },
  plugins: [typography],
}
