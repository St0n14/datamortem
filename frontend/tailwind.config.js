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
        // Timesketch color palette
        timesketch: {
          darkblue: '#1A237E',
          blue: '#283593',
          lightblue: '#3F51B5',
          accent: '#536DFE',
        },
        // Event types colors (Timesketch style)
        event: {
          file: '#4CAF50',
          process: '#2196F3',
          registry: '#FF9800',
          network: '#9C27B0',
          critical: '#F44336',
          warning: '#FFC107',
          info: '#00BCD4',
        }
      },
    },
  },
  plugins: [],
}
