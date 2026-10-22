import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build:single` makes one self-contained HTML file you can open by double-clicking.
export default defineConfig(({ mode }) => ({
  base: './',
  // shown in Settings so you can tell which build a phone is running
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist' },
}));
