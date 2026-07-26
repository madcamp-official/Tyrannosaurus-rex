import type { PlayerId, RoomCode } from "@trex/shared";

export type SocketRole = "HOST" | "PLAYER";

export type SocketData = {
  role: SocketRole;
  clientVersion: string;
  roomCode?: RoomCode;
  playerId?: PlayerId;
};

export type InterServerEvents = Record<string, never>;
