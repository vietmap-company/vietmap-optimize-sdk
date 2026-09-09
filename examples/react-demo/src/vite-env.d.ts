/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPTIMIZE_KEY?: string
  readonly VITE_MAP_KEY?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
