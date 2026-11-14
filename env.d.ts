/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend REST API, e.g. https://api.ruai.example/v1 */
  readonly VITE_API_URL?: string
  /** "true" — use in-browser mock services instead of the real backend */
  readonly VITE_USE_MOCKS?: string
  /** Public path the app is served from (GitHub Pages: /ruAI/) */
  readonly VITE_BASE?: string
  /** Секретный путь админки, например /k3J…/ (только сборка админки) */
  readonly VITE_ADMIN_BASE?: string
  /** "true" — мок админки с демо-данными (npm run dev:admin) */
  readonly VITE_ADMIN_MOCKS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
