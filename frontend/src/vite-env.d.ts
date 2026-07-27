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

/** vite.config.ts의 define으로 빌드 시점에 주입되는 타임스탬프. Godot 정적 자산 캐시 버스팅용. */
declare const __BUILD_TIME__: number;
