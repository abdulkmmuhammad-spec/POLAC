import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
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
