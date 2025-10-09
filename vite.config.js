import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const ORS_KEY = env.VITE_ORS_KEY || env.ORS_KEY
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/ors': {
          target: 'https://api.openrouteservice.org',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/ors/, ''),
          headers: ORS_KEY ? { Authorization: ORS_KEY } : {},
        },
      },
    },
  }
})
