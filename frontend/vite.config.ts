/** Plan.md §22.2. Socket.IO/HTTP API를 Node 서버로 프록시한다. */

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Godot 웹 빌드 산출물(.wasm/.pck)은 nginx가 1년 immutable 캐시로 내려주는데, 그걸 우회할
  // ?v= 쿼리값이 지금까지 고정 문자열("dev")이라 배포를 아무리 해도 브라우저가 최초 로드한
  // 빌드를 계속 재사용했다 — 빌드마다 바뀌는 값을 주입해 매 배포 후 새로 받아오게 한다.
  define: {
    __BUILD_TIME__: JSON.stringify(Date.now()),
  },
  test: {
    environment: "jsdom",
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Cloudflare Tunnel(trycloudflare.com)이 매번 다른 서브도메인을 발급해 특정 호스트를
    // 고정할 수 없다 — Plan.md §0.1 "iOS 센서용 HTTPS 개발 환경"을 위한 개발 전용 설정.
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/socket.io": {
        target: "http://127.0.0.1:3001",
        ws: true,
      },
      "/api": {
        target: "http://127.0.0.1:3001",
      },
    },
  },
});
