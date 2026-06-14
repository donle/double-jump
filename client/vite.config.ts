import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: '../assets',
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // 允许任意 Host header（同局域网手机/平板用本机 IP 访问时不会被 Vite 5 的 host check 拦下；
    // 公网经 natapp 穿透时 Host header 也会变成 natapp 域名）
    allowedHosts: true,
    open: false,
    fs: {
      allow: ['..'],
    },
    proxy: {
      // 浏览器→Vite 的 /ws 升级请求转给本机 8787 WebSocket 后端。
      // 这样前端代码只要写相对路径 /ws，LAN / localhost / natapp 都能用同一份代码。
      '/ws': {
        target: 'ws://localhost:8787',
        ws: true,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
});
