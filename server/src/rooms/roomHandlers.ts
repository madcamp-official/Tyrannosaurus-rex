/** Plan.md §16~18, §21. 로비 관련 Socket.IO 이벤트 핸들러 (Day1 범위). */

import type { Server, Socket } from "socket.io";
import {
  gameStartRequestSchema,
  playerSetReadyRequestSchema,
  roomCreateRequestSchema,
  roomJoinRequestSchema,
  roomRequestStateRequestSchema,
  type ApiError,
  type ClientToServerEvents,
  type RoomCreateResponse,
  type RoomJoinResponse,
  type RoomState,
  type ServerEvent,
  type ServerToClientEvents,
} from "@trex/shared";
import { randomUUID } from "node:crypto";
import type { RoomManager } from "./RoomManager.js";
import type { InterServerEvents, SocketData } from "./socketData.js";
import { ackErr, ackOk } from "../validation/ack.js";
import { IdempotencyCache } from "../validation/idempotency.js";
import { TokenBucketLimiter } from "../validation/rateLimit.js";

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const idempotency = new IdempotencyCache();
const roomCreateLimiter = new TokenBucketLimiter(1, 1 / 60);
const roomJoinLimiter = new TokenBucketLimiter(2, 2);
const setReadyLimiter = new TokenBucketLimiter(2, 2);
const gameStartLimiter = new TokenBucketLimiter(1, 1);
const requestStateLimiter = new TokenBucketLimiter(1, 1 / 5);

function socketRoomChannel(roomCode: string): string {
  return `room:${roomCode}`;
}
function hostChannel(roomCode: string): string {
  return `host:${roomCode}`;
}
function teamChannel(roomCode: string, teamId: string): string {
  return `team:${roomCode}:${teamId}`;
}

function toServerEvent<T>(roomCode: string, revision: number, data: T): ServerEvent<T> {
  return { eventId: randomUUID(), serverTime: Date.now(), roomCode, revision, data };
}

export function registerRoomHandlers(io: AppServer, socket: AppSocket, rooms: RoomManager): void {
  socket.on("room:create", (req, ack) => {
    if (!roomCreateLimiter.tryConsume(socket.id)) {
      return ack(ackErr(req?.requestId ?? "unknown", "RATE_LIMITED", "too many room:create attempts", true));
    }
    const parsed = roomCreateRequestSchema.safeParse(req);
    if (!parsed.success) {
      return ack(ackErr(req?.requestId ?? "unknown", "INVALID_PAYLOAD", parsed.error.message, true));
    }
    if (socket.data.role !== "HOST") {
      return ack(ackErr(parsed.data.requestId, "HOST_ONLY", "only desktop hosts may create rooms", false));
    }
    const cached = idempotency.get<RoomCreateResponse>(socket.id, parsed.data.requestId);
    if (cached) return ack(cached);

    const created = rooms.createRoom(socket.id);
    if (!created) {
      const res = ackErr(parsed.data.requestId, "SERVER_ERROR", "failed to allocate room code", true);
      idempotency.set(socket.id, parsed.data.requestId, res);
      return ack(res);
    }
    socket.data.roomCode = created.room.state.roomCode;
    void socket.join([socketRoomChannel(created.room.state.roomCode), hostChannel(created.room.state.roomCode)]);

    const res = ackOk(parsed.data.requestId, {
      roomCode: created.room.state.roomCode,
      joinUrl: created.joinUrl,
      state: rooms.getPublicState(created.room),
    });
    idempotency.set(socket.id, parsed.data.requestId, res);
    ack(res);
  });

  socket.on("room:join", (req, ack) => {
    if (!roomJoinLimiter.tryConsume(socket.id)) {
      return ack(ackErr(req?.requestId ?? "unknown", "RATE_LIMITED", "too many room:join attempts", true));
    }
    const parsed = roomJoinRequestSchema.safeParse(req);
    if (!parsed.success) {
      return ack(ackErr(req?.requestId ?? "unknown", "INVALID_PAYLOAD", parsed.error.message, true));
    }
    if (socket.data.role !== "PLAYER") {
      return ack(ackErr(parsed.data.requestId, "HOST_ONLY", "only mobile players may join rooms", false));
    }
    const cached = idempotency.get<RoomJoinResponse>(socket.id, parsed.data.requestId);
    if (cached) return ack(cached);

    const result = rooms.joinRoom(parsed.data.roomCode, parsed.data.nickname, socket.id);
    if (!result.ok) {
      const retryable = result.error !== "ROOM_NOT_FOUND" && result.error !== "ROOM_ALREADY_STARTED";
      const res = ackErr(parsed.data.requestId, result.error, describeJoinError(result.error), retryable);
      idempotency.set(socket.id, parsed.data.requestId, res);
      return ack(res);
    }

    socket.data.roomCode = result.room.state.roomCode;
    socket.data.playerId = result.playerId;
    void socket.join([
      socketRoomChannel(result.room.state.roomCode),
      teamChannel(result.room.state.roomCode, result.teamId),
    ]);

    const publicState = rooms.getPublicState(result.room);
    const res = ackOk(parsed.data.requestId, {
      playerId: result.playerId,
      teamId: result.teamId,
      color: result.color,
      state: publicState,
    });
    idempotency.set(socket.id, parsed.data.requestId, res);
    ack(res);

    const joinedPlayer = publicState.players.find((p) => p.id === result.playerId)!;
    io.to(socketRoomChannel(result.room.state.roomCode)).emit(
      "room:playerJoined",
      toServerEvent(result.room.state.roomCode, publicState.revision, joinedPlayer),
    );
    broadcastRoomState(io, rooms, result.room.state.roomCode);
  });

  socket.on("player:setReady", (req, ack) => {
    if (!setReadyLimiter.tryConsume(socket.id)) {
      return ack(ackErr(req?.requestId ?? "unknown", "RATE_LIMITED", "too many player:setReady attempts", true));
    }
    const parsed = playerSetReadyRequestSchema.safeParse(req);
    if (!parsed.success) {
      return ack(ackErr(req?.requestId ?? "unknown", "INVALID_PAYLOAD", parsed.error.message, true));
    }
    const roomCode = socket.data.roomCode;
    const playerId = socket.data.playerId;
    if (!roomCode || !playerId) {
      return ack(ackErr(parsed.data.requestId, "PLAYER_NOT_JOINED", "join a room before setting ready state", false));
    }
    const updated = rooms.setReady(roomCode, playerId, parsed.data.ready);
    if (!updated) {
      return ack(ackErr(parsed.data.requestId, "ROOM_NOT_FOUND", "room no longer exists", false));
    }
    ack(ackOk(parsed.data.requestId, { playerId, ready: parsed.data.ready }));
    broadcastRoomState(io, rooms, roomCode);
  });

  socket.on("game:start", (req, ack) => {
    if (!gameStartLimiter.tryConsume(socket.id)) {
      return ack(ackErr(req?.requestId ?? "unknown", "RATE_LIMITED", "too many game:start attempts", true));
    }
    const parsed = gameStartRequestSchema.safeParse(req);
    if (!parsed.success) {
      return ack(ackErr(req?.requestId ?? "unknown", "INVALID_PAYLOAD", parsed.error.message, true));
    }
    const roomCode = socket.data.roomCode;
    if (socket.data.role !== "HOST" || !roomCode) {
      return ack(ackErr(parsed.data.requestId, "HOST_ONLY", "only the room host may start the game", false));
    }
    const room = rooms.getRoom(roomCode);
    if (!room) {
      return ack(ackErr(parsed.data.requestId, "ROOM_NOT_FOUND", "room no longer exists", false));
    }
    const blocker = rooms.canStart(room);
    if (blocker === "WRONG_ROOM_PHASE") {
      return ack(ackErr(parsed.data.requestId, "WRONG_ROOM_PHASE", "room is not in LOBBY", false));
    }
    if (blocker === "NOT_ENOUGH_PLAYERS" || blocker === "NOT_ALL_READY") {
      return ack(ackErr(parsed.data.requestId, "INVALID_PAYLOAD", blocker, true));
    }

    const { seed, roundStartedAt, roundEndsAt } = rooms.startGame(room);
    const state = rooms.getPublicState(room);
    ack(ackOk(parsed.data.requestId, { roundStartedAt, roundEndsAt, seed, state }));

    io.to(socketRoomChannel(roomCode)).emit(
      "room:phaseChanged",
      toServerEvent(roomCode, state.revision, { from: "LOBBY", to: "PLAYING", endsAt: roundEndsAt }),
    );
    broadcastRoomState(io, rooms, roomCode);
  });

  socket.on("room:requestState", (req, ack) => {
    if (!requestStateLimiter.tryConsume(socket.id)) {
      return ack(ackErr(req?.requestId ?? "unknown", "RATE_LIMITED", "too many room:requestState attempts", true));
    }
    const parsed = roomRequestStateRequestSchema.safeParse(req);
    if (!parsed.success) {
      return ack(ackErr(req?.requestId ?? "unknown", "INVALID_PAYLOAD", parsed.error.message, true));
    }
    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.getRoom(roomCode) : undefined;
    if (!room) {
      return ack(ackErr(parsed.data.requestId, "ROOM_NOT_FOUND", "room no longer exists", false));
    }
    if (room.state.revision <= parsed.data.knownRevision) {
      return ack(ackOk(parsed.data.requestId, { changed: false, revision: room.state.revision }));
    }
    ack(ackOk(parsed.data.requestId, { changed: true, state: rooms.getPublicState(room) }));
  });

  socket.on("disconnect", () => {
    idempotency.dropSocket(socket.id);
    roomCreateLimiter.dropKey(socket.id);
    roomJoinLimiter.dropKey(socket.id);
    setReadyLimiter.dropKey(socket.id);
    gameStartLimiter.dropKey(socket.id);
    requestStateLimiter.dropKey(socket.id);

    if (socket.data.role === "HOST") {
      const room = rooms.findRoomByHostSocket(socket.id);
      if (room) {
        const roomCode = room.state.roomCode;
        io.to(socketRoomChannel(roomCode)).emit(
          "room:closed",
          toServerEvent(roomCode, room.state.revision, { reason: "HOST_DISCONNECTED" }),
        );
        rooms.closeRoom(roomCode);
      }
      return;
    }

    const found = rooms.findRoomByPlayerSocket(socket.id);
    if (!found) return;
    rooms.setPlayerConnected(found.room, found.playerId, false);
    broadcastPlayerConnectionChanged(io, rooms, found.room.state.roomCode, found.playerId, false);
    broadcastRoomState(io, rooms, found.room.state.roomCode);
  });
}

function broadcastRoomState(io: AppServer, rooms: RoomManager, roomCode: string): void {
  const room = rooms.getRoom(roomCode);
  if (!room) return;
  const state = rooms.getPublicState(room);
  io.to(socketRoomChannel(roomCode)).emit("room:state", toServerEvent(roomCode, state.revision, state));
}

function broadcastPlayerConnectionChanged(
  io: AppServer,
  rooms: RoomManager,
  roomCode: string,
  playerId: string,
  connected: boolean,
): void {
  const room = rooms.getRoom(roomCode);
  if (!room) return;
  io.to(socketRoomChannel(roomCode)).emit(
    "room:playerConnectionChanged",
    toServerEvent(roomCode, room.state.revision, { playerId, connected }),
  );
}

function describeJoinError(code: string): string {
  switch (code) {
    case "ROOM_NOT_FOUND":
      return "room code does not exist";
    case "ROOM_ALREADY_STARTED":
      return "room already started";
    case "ROOM_FULL":
      return "room is full";
    case "NICKNAME_INVALID":
      return "nickname must be 1-8 characters without control characters or < >";
    case "NICKNAME_TAKEN":
      return "nickname already used in this room";
    default:
      return code;
  }
}

export type { ApiError, RoomState };
