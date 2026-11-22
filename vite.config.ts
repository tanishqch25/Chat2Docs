import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { shareFetchProxy } from './vite-share-proxy.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), shareFetchProxy()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
