import { randomUUID } from "node:crypto";
import type { RoomCode, ServerEvent } from "@trex/shared";
import type { RoomManager } from "./RoomManager.js";
import type { AppServer } from "./types.js";
import { roomChannel } from "./channels.js";

export function toServerEvent<T>(roomCode: string, revision: number, data: T): ServerEvent<T> {
  return { eventId: randomUUID(), serverTime: Date.now(), roomCode, revision, data };
}

export function broadcastRoomState(io: AppServer, rooms: RoomManager, roomCode: RoomCode): void {
  const room = rooms.getRoom(roomCode);
  if (!room) return;
  const state = rooms.getPublicState(room);
  io.to(roomChannel(roomCode)).emit("room:state", toServerEvent(roomCode, state.revision, state));
}
