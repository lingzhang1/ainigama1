import react from "@vitejs/plugin-react";
import tailwind from "tailwindcss";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    base: "./",
    server: {
      host: true,
      port: 5173,
      cors: true
    },
    css: {
      postcss: {
        plugins: [tailwind()],
      },
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
      'import.meta.env.VITE_DEEPSEEK_API_KEY': JSON.stringify(env.VITE_DEEPSEEK_API_KEY || 'sk-0dcbd0d5eca74684919812e175de65b7'),
      'process.env.VITE_DEEPSEEK_API_KEY': JSON.stringify(env.VITE_DEEPSEEK_API_KEY || 'sk-0dcbd0d5eca74684919812e175de65b7'),
      'process.env.DEEPSEEK_API_KEY': JSON.stringify(env.VITE_DEEPSEEK_API_KEY || 'sk-0dcbd0d5eca74684919812e175de65b7'),
      'import.meta.env.VITE_WEBSOCKET_URL': JSON.stringify(env.VITE_WEBSOCKET_URL || 'ws://localhost:3002'),
      'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || 'http://localhost:3002/api'),
    },
  };
});
