/** Plan.md §22.2. Socket.IO/HTTP API를 Node 서버로 프록시한다. */

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
