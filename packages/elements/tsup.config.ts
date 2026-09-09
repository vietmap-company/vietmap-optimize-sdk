import { defineConfig } from 'tsup'

// Two outputs: (1) ESM+CJS with lit/core external (for bundlers), and
// (2) a self-contained IIFE that bundles lit + core for <script>/CDN use.
export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2020',
    external: ['lit', '@vietmap/optimize-sdk'],
  },
  {
    entry: { index: 'src/index.ts' },
    format: ['iife'],
    globalName: 'VietmapOptimizeElements',
    sourcemap: true,
    minify: true,
    target: 'es2020',
    outExtension: () => ({ js: '.global.js' }),
    noExternal: ['lit', '@vietmap/optimize-sdk'],
  },
])
