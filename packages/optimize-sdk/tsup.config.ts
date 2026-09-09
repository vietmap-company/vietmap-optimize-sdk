import { defineConfig } from 'tsup'

// One package, three entry points — core (`.`), `/elements`, `/react` — plus two
// self-contained IIFE bundles for <script>/CDN use.
export default defineConfig([
  // ESM + CJS for all entries. Core is shared via code-splitting so it isn't
  // duplicated across the subpaths; lit/react stay external (our dep / peer).
  {
    entry: {
      index: 'src/index.ts',
      'elements/index': 'src/elements/index.ts',
      'react/index': 'src/react/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: true,
    target: 'es2020',
    external: ['lit', 'react', 'react-dom', 'react/jsx-runtime'],
  },
  // Core IIFE (zero-dep) — global `VietmapOptimizeSDK`.
  {
    entry: { index: 'src/index.ts' },
    format: ['iife'],
    globalName: 'VietmapOptimizeSDK',
    sourcemap: true,
    minify: true,
    target: 'es2019',
    outExtension: () => ({ js: '.global.js' }),
  },
  // Elements IIFE (bundles lit + core) — global `VietmapOptimizeElements`.
  {
    entry: { 'elements/index': 'src/elements/index.ts' },
    format: ['iife'],
    globalName: 'VietmapOptimizeElements',
    sourcemap: true,
    minify: true,
    target: 'es2020',
    outExtension: () => ({ js: '.global.js' }),
  },
])
