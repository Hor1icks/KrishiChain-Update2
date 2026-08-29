import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Demo build: no proxy. The real client proxies /api to the Express server
// on :5000; this build answers every request from recorded fixtures inside
// the bundle (src/api/client.js), so there is nothing to proxy to and
// leaving the rule in would imply a backend that is not there.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
})
