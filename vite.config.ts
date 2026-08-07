import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.ts',
        onstart(options) {
          if (process.env.VITE_DEV_SERVER_URL) {
            options.startup()
          }
        },
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: { output: { entryFileNames: 'index.js' } }
          }
        }
      },
      {
        entry: 'src/preload/index.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            rollupOptions: { output: { entryFileNames: 'index.js' } }
          }
        }
      }
    ]),
    renderer()
  ],
  build: {
    outDir: 'dist'
  },
  server: {
    port: 5173
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  }
})
