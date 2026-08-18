import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 5173,
    host: true, // Expose to local network
    proxy: {
      '/users': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/products': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/orders': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/chips': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/carts': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/manages': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/iporders': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/eporders': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/histories': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/images': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/section-images': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
  base: '/admin/', // Đảm bảo tài nguyên tĩnh dùng /admin
});
