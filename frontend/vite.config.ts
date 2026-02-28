import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Production: Django serves frontend at /static/, so assets must load from /static/
  // In dev mode, always use '/' so Vite dev server works correctly
  base: mode === 'production' ? '/static/' : '/',
}))
