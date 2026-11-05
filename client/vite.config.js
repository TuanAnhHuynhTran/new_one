import { defineConfig } from 'vite';
export default defineConfig({server:{port:5050,strictPort:true,proxy:{'/api':{target:'http://localhost:3001',changeOrigin:true}}}});
