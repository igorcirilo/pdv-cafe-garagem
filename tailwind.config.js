/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cafe: {
          dark: '#211A15',
          primary: '#A94F08',
          secondary: '#E8BF85',
          bg: '#F9F6F0',
          card: '#FFFFFF'
        }
      }
    },
  },
  plugins: [],
}