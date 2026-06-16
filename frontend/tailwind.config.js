/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // Questa riga dice a Tailwind dove cercare le classi
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}