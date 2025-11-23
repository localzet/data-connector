// Type definitions for import.meta.env (Vite environment variables)
// This allows the library to work with Vite projects without requiring vite as a dependency

interface ImportMetaEnv {
  readonly VITE_MIX_ID_API_BASE?: string
  readonly VITE_MIX_ID_CLIENT_ID?: string
  readonly VITE_MIX_ID_CLIENT_SECRET?: string
  [key: string]: any
}

interface ImportMeta {
  readonly env?: ImportMetaEnv
}

