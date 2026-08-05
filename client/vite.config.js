import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxying /api to the Express server means the browser only ever
    // talks to one origin, so there is no CORS preflight in development
    // and fetch calls can use plain relative paths like '/api/auth/login'.
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
