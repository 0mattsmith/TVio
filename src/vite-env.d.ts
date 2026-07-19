/// <reference types="vite/client" />

// Injected by vite.config.ts from package.json
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_TMDB_KEY?: string;
  readonly VITE_TMDB_TOKEN?: string;
  readonly VITE_TMDB_REGION?: string;
  readonly VITE_TMDB_PROXY?: string;
  readonly VITE_OMDB_KEY?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
