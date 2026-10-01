import { defineConfig } from 'vite'
import { resolve } from 'path'

// 多页面:每个 html 都是一个独立入口(导航、讲解、变种、各互动 demo)
const pages = ['index', 'tutorial', 'variants', 'play-chaos', 'play-schottky', 'play-maskit', 'play-inversion', 'play-hyperbolic', 'play-mobius', 'play-3d']

export default defineConfig({
  // CI 里设置 VITE_BASE_URL=https://cos-sh.tiye.me/<owner>/<repo>/ ,让 js/css 走 CDN;
  // 本地开发时未设置,走 "/"。页面之间的链接全部是相对路径,所以同时能部署在服务器子目录下。
  base: process.env.VITE_BASE_URL || '/',
  server: { port: 5173 },
  build: {
    rollupOptions: {
      input: Object.fromEntries(pages.map((p) => [p, resolve(__dirname, `${p}.html`)])),
    },
  },
})
