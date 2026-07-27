/** Plan.md §10.2, §16.2. React 애플리케이션당 하나의 Socket.IO 연결. */

import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, RoomCode, ServerToClientEvents } from "@trex/shared";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const APP_CLIENT_VERSION = "1.0.0";

let activeSocket: AppSocket | null = null;

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
