/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend REST API, e.g. https://api.ruai.example/v1 */
  readonly VITE_API_URL?: string
  /** "true" — use in-browser mock services instead of the real backend */
  readonly VITE_USE_MOCKS?: string
  /** Public path the app is served from (GitHub Pages: /ruAI/) */
  readonly VITE_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
