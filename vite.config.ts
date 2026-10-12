import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vercel 배포 기본값은 루트(/). 서브경로 배포가 필요할 때만 VITE_BASE 지정
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
});
