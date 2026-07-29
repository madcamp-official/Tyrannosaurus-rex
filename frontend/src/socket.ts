/** Plan.md §10.2, §16.2. React 애플리케이션당 하나의 Socket.IO 연결. */

import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, RoomCode, ServerToClientEvents } from "@trex/shared";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const APP_CLIENT_VERSION = "1.0.0";

let activeSocket: AppSocket | null = null;

// 폰과 데스크탑의 시스템 시계가 서로 어긋나 있으면, 둘 다 "서버가 보낸 phaseStartedAt"을
// 각자의 Date.now()와 비교해 페이즈 시작 카운트다운을 계산하다 보니 화면마다 다른 숫자가
// 보였다 — 모든 서버 이벤트(ServerEvent)에는 발송 시점의 serverTime이 실려 오므로, 이걸로
// "이 기기의 시계가 서버보다 얼마나 빠른지/느린지" 오프셋을 계속 갱신해두고, 카운트다운
// 계산은 항상 serverNow()(=이 기기의 Date.now() + 오프셋)로 해 모든 화면이 같은 서버
// 기준 시각에 맞춰지게 한다.
let clockOffsetMs = 0;

export function serverNow(): number {
  return Date.now() + clockOffsetMs;
}

function trackServerClockOffset(socket: AppSocket): void {
  socket.onAny((_event: string, payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const serverTime = (payload as { serverTime?: unknown }).serverTime;
    if (typeof serverTime === "number") {
      clockOffsetMs = serverTime - Date.now();
    }
  });
}

export type SocketRole = "HOST" | "PLAYER";

export function connectSocket(role: SocketRole, roomCode?: RoomCode): AppSocket {
  if (activeSocket) {
    activeSocket.close();
    activeSocket = null;
  }
  const socket: AppSocket = io({
    path: import.meta.env.VITE_SOCKET_PATH || "/socket.io",
    auth: { role, clientVersion: APP_CLIENT_VERSION, roomCode },
    autoConnect: true,
  });
  trackServerClockOffset(socket);
  activeSocket = socket;
  return socket;
}

export function getSocket(): AppSocket | null {
  return activeSocket;
}

export function disconnectSocket(): void {
  activeSocket?.close();
  activeSocket = null;
}
