/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOCKET_PATH: string;
  readonly VITE_API_VERSION: string;
  readonly VITE_GODOT_ENTRY: string;
  readonly VITE_GODOT_ASSET_VERSION: string;
  readonly VITE_ENABLE_DEBUG_PANEL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
