import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const packageJson = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))

const commonProxy = {
  '/api/ollama': {
    target: 'http://127.0.0.1:11434',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/ollama/, ''),
  },
  '/api/overpass': {
    target: 'https://overpass-api.de',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/overpass/, '/api/interpreter'),
  },
  '/api/overpass-kumi': {
    target: 'https://overpass.kumi.systems',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/overpass-kumi/, '/api/interpreter'),
  },
  '/api/nominatim': {
    target: 'https://nominatim.openstreetmap.org',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/nominatim/, ''),
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    'import.meta.env.__APP_VERSION__': JSON.stringify(packageJson.version),
  },
  envPrefix: ['VITE_', 'LLM_'],
  build: {
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2,
      },
      mangle: {
        toplevel: true,
      },
      format: {
        comments: false,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ['vue', 'pinia'],
          map: ['maplibre-gl'],
          turf: ['@turf/helpers', '@turf/bbox', '@turf/boolean-point-in-polygon'],
        },
      },
    },
  },
  server: {
    proxy: commonProxy,
  },
  preview: {
    proxy: commonProxy,
  },
})
