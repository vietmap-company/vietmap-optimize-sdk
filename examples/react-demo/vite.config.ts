import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Dedicated port so it never collides with driver-connect-web-react, which
  // also runs Vite and claims the default 5173.
  server: { port: 5180 },
})
