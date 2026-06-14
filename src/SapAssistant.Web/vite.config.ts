import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.services__api__http__0 ?? 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/signin-oidc': {
        target: process.env.services__api__http__0 ?? 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/signout-callback-oidc': {
        target: process.env.services__api__http__0 ?? 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
