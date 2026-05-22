import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3001',
      '/sb': {
        target: 'https://bkgpivxpzuzedezxtknd.supabase.co',
        rewrite: (path) => path.replace(/^\/sb/, ''),
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
