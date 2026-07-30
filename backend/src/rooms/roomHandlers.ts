/** Plan.md §16~18, §21. 로비 관련 Socket.IO 이벤트 핸들러 (Day1 범위). */

import {
  gameRematchRequestSchema,
  gameStartRequestSchema,
  playerSetReadyRequestSchema,
  roomCreateRequestSchema,
  roomHostReconnectRequestSchema,
  roomJoinRequestSchema,
  roomRequestStateRequestSchema,
  TEAM_IDS,
  type ApiError,
  type RoomCreateResponse,
  type RoomJoinResponse,
  type RoomState,
} from "@trex/shared";
import type { RoomManager } from "./RoomManager.js";
import type { AppServer, AppSocket } from "./types.js";
import { ackErr, ackOk } from "../validation/ack.js";
import { IdempotencyCache } from "../validation/idempotency.js";
import { TokenBucketLimiter } from "../validation/rateLimit.js";
import { hostChannel, roomChannel, teamChannel } from "./channels.js";
import { broadcastRoomState, toServerEvent } from "./broadcast.js";
import { broadcastResultIfFinalized } from "./energyHandlers.js";

const idempotency = new IdempotencyCache();
const roomCreateLimiter = new TokenBucketLimiter(1, 1 / 60);
const roomJoinLimiter = new TokenBucketLimiter(2, 2);
const setReadyLimiter = new TokenBucketLimiter(2, 2);
const gameStartLimiter = new TokenBucketLimiter(1, 1);
const rematchLimiter = new TokenBucketLimiter(1, 1);
const requestStateLimiter = new TokenBucketLimiter(1, 1 / 5);

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

    const created = rooms.createRoom(socket.id, parsed.data.roomName, parsed.data.settings.maxPlayersPerTeam, {
      A: parsed.data.settings.teamAName,
      B: parsed.data.settings.teamBName,
    });
    if (!created) {
      const res = ackErr(parsed.data.requestId, "SERVER_ERROR", "failed to allocate room code", true);
      idempotency.set(socket.id, parsed.data.requestId, res);
      return ack(res);
    }
    socket.data.roomCode = created.room.state.roomCode;
    void socket.join([roomChannel(created.room.state.roomCode), hostChannel(created.room.state.roomCode)]);

    const res = ackOk(parsed.data.requestId, {
      roomCode: created.room.state.roomCode,
      joinUrl: created.joinUrl,
      hostReconnectToken: created.room.hostReconnectToken,
      state: rooms.getPublicState(created.room),
    });
    idempotency.set(socket.id, parsed.data.requestId, res);
    ack(res);
  });

  /**
   * 호스트 소켓이 일시적으로 끊겼다 돌아왔을 때(§HOST_RECONNECT_GRACE_MS) room:create 없이
   * 같은 방을 다시 붙잡는다. 새 소켓이라 room:create의 hostSocketId 기반 중복 체크로는
   * 못 알아보므로 별도 토큰으로 검증한다.
   */
  socket.on("room:hostReconnect", (req, ack) => {
    const parsed = roomHostReconnectRequestSchema.safeParse(req);
    if (!parsed.success) {
      return ack(ackErr(req?.requestId ?? "unknown", "INVALID_PAYLOAD", parsed.error.message, true));
    }
    if (socket.data.role !== "HOST") {
      return ack(ackErr(parsed.data.requestId, "HOST_ONLY", "only desktop hosts may reconnect a room", false));
    }
    const room = rooms.reconnectHost(parsed.data.roomCode, parsed.data.hostReconnectToken, socket.id);
    if (!room) {
      return ack(ackErr(parsed.data.requestId, "ROOM_NOT_FOUND", "room no longer exists", false));
    }
    socket.data.roomCode = room.state.roomCode;
    void socket.join([roomChannel(room.state.roomCode), hostChannel(room.state.roomCode)]);

    const res = ackOk(parsed.data.requestId, { state: rooms.getPublicState(room) });
    ack(res);
    broadcastRoomState(io, rooms, room.state.roomCode);
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

    const result = rooms.joinRoom(
      parsed.data.roomCode,
      parsed.data.nickname,
      socket.id,
      parsed.data.reconnectToken,
    );
    if (!result.ok) {
      const retryable = result.error !== "ROOM_NOT_FOUND" && result.error !== "ROOM_ALREADY_STARTED";
      const res = ackErr(parsed.data.requestId, result.error, describeJoinError(result.error), retryable);
      idempotency.set(socket.id, parsed.data.requestId, res);
      return ack(res);
    }

    socket.data.roomCode = result.room.state.roomCode;
    socket.data.playerId = result.playerId;
    void socket.join([
      roomChannel(result.room.state.roomCode),
      teamChannel(result.room.state.roomCode, result.teamId),
    ]);

    const publicState = rooms.getPublicState(result.room);
    const res = ackOk(parsed.data.requestId, {
      playerId: result.playerId,
      teamId: result.teamId,
      color: result.color,
      reconnectToken: result.reconnectToken,
      reconnected: result.reconnected,
      state: publicState,
    });
    idempotency.set(socket.id, parsed.data.requestId, res);
    ack(res);

    const joinedPlayer = publicState.players.find((p) => p.id === result.playerId)!;
    if (result.reconnected) {
      broadcastPlayerConnectionChanged(io, rooms, result.room.state.roomCode, result.playerId, true);
    } else {
      io.to(roomChannel(result.room.state.roomCode)).emit(
        "room:playerJoined",
        toServerEvent(result.room.state.roomCode, publicState.revision, joinedPlayer),
      );
    }
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

    io.to(roomChannel(roomCode)).emit(
      "room:phaseChanged",
      toServerEvent(roomCode, state.revision, { from: "LOBBY", to: "PLAYING", endsAt: roundEndsAt }),
    );
    // 운석 피하기(ASSEMBLY)가 이제 첫 판이라 라운드 시작과 동시에 두 팀 모두 바로 시작한다.
    const channel = roomChannel(roomCode);
    for (const teamId of TEAM_IDS) {
      const team = room.state.teams[teamId];
      io.to(channel).emit(
        "dino:started",
        toServerEvent(roomCode, state.revision, {
          teamId,
          skyObjects: team.dinoRun.skyObjects,
          startedAt: team.phaseStartedAt,
          endsAt: team.phaseEndsAt ?? 0,
        }),
      );
    }
    broadcastRoomState(io, rooms, roomCode);
  });

  socket.on("game:rematch", (req, ack) => {
    if (!rematchLimiter.tryConsume(socket.id)) {
      return ack(ackErr(req?.requestId ?? "unknown", "RATE_LIMITED", "too many game:rematch attempts", true));
    }
    const parsed = gameRematchRequestSchema.safeParse(req);
    if (!parsed.success) {
      return ack(ackErr(req?.requestId ?? "unknown", "INVALID_PAYLOAD", parsed.error.message, true));
    }
    const roomCode = socket.data.roomCode;
    if (socket.data.role !== "HOST" || !roomCode) {
      return ack(ackErr(parsed.data.requestId, "HOST_ONLY", "only the room host may request a rematch", false));
    }
    const room = rooms.getRoom(roomCode);
    if (!room) {
      return ack(ackErr(parsed.data.requestId, "ROOM_NOT_FOUND", "room no longer exists", false));
    }

    rooms.rematchRoom(room, Date.now());
    const state = rooms.getPublicState(room);
    ack(ackOk(parsed.data.requestId, { state }));

    io.to(roomChannel(roomCode)).emit(
      "room:phaseChanged",
      toServerEvent(roomCode, state.revision, { from: "RESULT", to: "LOBBY", endsAt: null }),
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
      // 와이파이 순단·노트북 절전 같은 일시적 끊김이면 room:hostReconnect로 금방 돌아온다 —
      // 바로 방을 지우지 않고 유예 시간을 준다. 유예를 넘긴 방은 tickRoomBackground의
      // 배경 스윕(§HOST_RECONNECT_GRACE_MS)이 그때 가서 room:closed를 보내고 정리한다.
      if (room) rooms.markHostDisconnected(room, Date.now());
      return;
    }

    const found = rooms.findRoomByPlayerSocket(socket.id);
    if (!found) return;
    rooms.setPlayerConnected(found.room, found.playerId, false);
    broadcastPlayerConnectionChanged(io, rooms, found.room.state.roomCode, found.playerId, false);

    const player = found.room.state.players.find((p) => p.id === found.playerId);
    const finalized = player ? rooms.finalizeIfTeamFullyDisconnected(found.room, player.teamId, Date.now()) : false;

    broadcastRoomState(io, rooms, found.room.state.roomCode);
    broadcastResultIfFinalized(io, rooms, found.room.state.roomCode, finalized);
  });
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
  io.to(roomChannel(roomCode)).emit(
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
