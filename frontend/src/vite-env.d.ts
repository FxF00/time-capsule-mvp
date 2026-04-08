/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONTRACT_ADDRESS: string;
  readonly VITE_WEB3_STORAGE_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
