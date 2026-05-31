/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_URL: string
  readonly VITE_PEERJS_HOST: string
  readonly VITE_PEERJS_PORT: string
  readonly VITE_PEERJS_PATH: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
