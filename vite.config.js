import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: 'src',
  test: {
    root: '.',
    include: ['test/**/*.test.js'],
  },
  plugins: [
    viteSingleFile(),   // inlines all JS and CSS into a single index.html
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // Chart.js is loaded via CDN — don't bundle it
    rollupOptions: {
      external: ['chart.js'],
    },
  },
});
