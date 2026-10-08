import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        { find: 'formdata-polyfill', replacement: path.resolve(__dirname, 'src/lib/formdata-noop.ts') },
        { find: /^formdata-polyfill(\/.*)?$/, replacement: path.resolve(__dirname, 'src/lib/formdata-noop.ts') },
        { find: 'whatwg-fetch', replacement: path.resolve(__dirname, 'src/lib/formdata-noop.ts') },
        { find: /^@\//, replacement: path.resolve(__dirname, 'src/') },
      ],
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
          secure: false,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, res) => {
              if ((err as any).code === 'ECONNREFUSED' || (err as any).code === 'ECONNRESET') {
                if (res && !res.headersSent && typeof (res as any).writeHead === 'function') {
                  (res as any).writeHead(503, { 'Content-Type': 'application/json' });
                  (res as any).end(JSON.stringify({ status: 'backend_starting', message: 'Tyrone Backend Engine is initializing...' }));
                }
                return;
              }
              console.warn('Vite Proxy Notice:', err.message);
            });
          },
        },
        '/ws': {
          target: 'ws://127.0.0.1:8000',
          ws: true,
          changeOrigin: true,
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _socket) => {
              // Quietly absorb websocket connection resets during server startup
            });
          },
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâ€”file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: ['**/data/**'],
      },
    },
  };
});
