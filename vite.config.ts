import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite config for GitHub Pages under /dungeon-quest
export default defineConfig({
  plugins: [react()],
  base: '/dungeon-quest/',
})
