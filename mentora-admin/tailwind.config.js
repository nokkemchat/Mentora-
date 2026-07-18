/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
      },
      colors: {
        background: '#0B0F19', 
        surface: '#141C2B', 
        primary: '#8B80A5', 
        primaryHover: '#7A6F9B',
        border: '#1F2937', 
        text: '#F3F4F6', 
        textMuted: '#9CA3AF', 
        success: '#10B981', 
        warning: '#F59E0B', 
        error: '#EF4444', 
      }
    },
  },
  plugins: [],
}
