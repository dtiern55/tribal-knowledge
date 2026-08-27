import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The nav icons are alpha masks of 2-9 KB, which straddles Vite's 4 KB
    // default: three inlined and two shipped as files, for no reason anyone
    // chose. Lift it so the whole set inlines and first paint costs no extra
    // requests. The painted artwork is far above this and still emits.
    assetsInlineLimit: 10240,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
