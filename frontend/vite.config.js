import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

// https://vite.dev/config/
// Allow optional HTTPS during local development by setting these environment variables:
// SSL_KEY_PATH and SSL_CERT_PATH (absolute or relative paths to key and cert files).
const httpsOption = (process.env.SSL_KEY_PATH && process.env.SSL_CERT_PATH && fs.existsSync(process.env.SSL_KEY_PATH) && fs.existsSync(process.env.SSL_CERT_PATH))
  ? { key: fs.readFileSync(process.env.SSL_KEY_PATH), cert: fs.readFileSync(process.env.SSL_CERT_PATH) }
  : false

export default defineConfig({
  plugins: [react()],
  server: {
    // expose server on LAN so other devices can reach it (use with care)
    host: '0.0.0.0',
    https: httpsOption,
    proxy: {
      // Proxy API requests to backend during development
      '/api': {
        // Use HTTP vs HTTPS depending on whether HTTPS is enabled above.
        // If the backend is running plain HTTP (default), a proxy target with
        // `https://` will cause TLS handshake errors like "wrong version
        // number" (EPROTO). We pick the correct protocol automatically to
        // avoid that.
        target: (httpsOption ? 'https://localhost:4000' : 'http://localhost:4000'),
        changeOrigin: true,
        // keep secure:false when target is HTTPS with self-signed certs
        secure: !!httpsOption,
      },
      // Proxy uploaded static files so image URLs like /uploads/... load in the dev server
      '/uploads': {
        target: (httpsOption ? 'https://localhost:4000' : 'http://localhost:4000'),
        changeOrigin: true,
        secure: !!httpsOption,
      },
    },
  },
})
