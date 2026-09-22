import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        VitePWA({
          strategies: 'injectManifest',
          srcDir: 'public',
          filename: 'sw.js',
          registerType: 'autoUpdate',
          injectRegister: 'auto',
          injectManifest: {
            injectionPoint: null,
          },
          devOptions: {
            enabled: true, // Allow testing PWA in development
            type: 'module',
          },
          manifest: {
            id: '/',
            start_url: '/',
            scope: '/',
            name: 'POLAC Parade Management',
            short_name: 'POLAC Parade',
            description: 'Police Academy Parade Management System',
            theme_color: '#1e3a8a',
            background_color: '#ffffff',
            display: 'standalone',
            orientation: 'portrait-primary',
            icons: [
              {
                src: '/logo.png',
                sizes: '192x192',
                type: 'image/png'
              },
              {
                src: '/logo.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable'
              }
            ]
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-react': ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
              'vendor-supabase': ['@supabase/supabase-js'],
              'vendor-ui': ['framer-motion', 'lucide-react', 'react-hot-toast'],
              'vendor-export': ['jspdf', 'jspdf-autotable', 'xlsx'],
              'vendor-charts': ['recharts']
            }
          }
        }
      }
    };
});
