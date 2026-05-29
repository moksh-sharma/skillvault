import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig(({ mode }) => {
  // Local dev backend (FastAPI)
  const backendTarget = 'http://localhost:8002'

  return {
    plugins: [react()],
    base: "/",
    server: {
      port: 3005,
      host: '127.0.0.1',
      open: 'http://localhost:3005/',
      strictPort: true, // Always use port 3005 internally; exit if busy
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        },
        '/uploads': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      rollupOptions: {
        input: './index.html'
      }
    }
  }
})
