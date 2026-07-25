/** Plan.md §17.6~17.8, §18. 골격 퍼즐 조작권·이동·배치 이벤트 핸들러. */

import { puzzleClaimRequestSchema, puzzleMoveInputSchema, puzzlePlaceRequestSchema } from "@trex/shared";
import type { RoomManager } from "./RoomManager.js";
import type { AppServer, AppSocket } from "./types.js";
import { roomChannel } from "./channels.js";
import { broadcastRoomState, toServerEvent } from "./broadcast.js";
import { ackErr, ackOk } from "../validation/ack.js";
import { TokenBucketLimiter } from "../validation/rateLimit.js";

const claimLimiter = new TokenBucketLimiter(3, 3);
const placeLimiter = new TokenBucketLimiter(3, 3);

function playerTeam(rooms: RoomManager, roomCode: string, playerId: string) {
  const room = rooms.getRoom(roomCode);
  const player = room?.state.players.find((p) => p.id === playerId);
  if (!room || !player) return null;
  return { room, player, teamId: player.teamId };
}

export function registerPuzzleHandlers(io: AppServer, socket: AppSocket, rooms: RoomManager): void {
  socket.on("puzzle:claim", (req, ack) => {
    if (!claimLimiter.tryConsume(socket.id)) {
      return ack(ackErr(req?.requestId ?? "unknown", "RATE_LIMITED", "too many puzzle:claim attempts", true));
    }
    const parsed = puzzleClaimRequestSchema.safeParse(req);
    if (!parsed.success) return ack(ackErr(req?.requestId ?? "unknown", "INVALID_PAYLOAD", parsed.error.message, true));

    const roomCode = socket.data.roomCode;
    const playerId = socket.data.playerId;
    if (socket.data.role !== "PLAYER" || !roomCode || !playerId) {
      return ack(ackErr(parsed.data.requestId, "PLAYER_NOT_JOINED", "join a room first", false));
    }
    const ctx = playerTeam(rooms, roomCode, playerId);
    if (!ctx) return ack(ackErr(parsed.data.requestId, "ROOM_NOT_FOUND", "room no longer exists", false));

    const now = Date.now();
    const result = rooms.applyPuzzleClaim(ctx.room, ctx.teamId, playerId, parsed.data.boneId, now);
    if (!result.ok) {
      const retryable = result.error === "PIECE_ALREADY_CLAIMED" || result.error === "RATE_LIMITED";
      return ack(ackErr(parsed.data.requestId, result.error, `puzzle:claim rejected: ${result.error}`, retryable));
    }

    ack(
      ackOk(parsed.data.requestId, {
        boneId: result.boneId,
        claimToken: result.claimToken,
        expiresAt: result.expiresAt,
        transform: result.transform,
      }),
    );

    io.to(roomChannel(roomCode)).emit(
      "puzzle:claimChanged",
      toServerEvent(roomCode, ctx.room.state.revision, {
        teamId: ctx.teamId,
        boneId: result.boneId,
        claimedBy: playerId,
        expiresAt: result.expiresAt,
      }),
    );
  });

  socket.on("puzzle:move", (input) => {
    const parsed = puzzleMoveInputSchema.safeParse(input);
    if (!parsed.success) return;
    const roomCode = socket.data.roomCode;
    const playerId = socket.data.playerId;
    if (socket.data.role !== "PLAYER" || !roomCode || !playerId) return;
    const ctx = playerTeam(rooms, roomCode, playerId);
    if (!ctx) return;

    const now = Date.now();
    const result = rooms.applyPuzzleMove(
      ctx.room,
      ctx.teamId,
      playerId,
      parsed.data.boneId,
      parsed.data.claimToken,
      parsed.data.transform,
      now,
    );
    if (!result.ok) return;

    io.to(roomChannel(roomCode)).emit(
      "puzzle:pieceMoved",
      toServerEvent(roomCode, ctx.room.state.revision, {
        teamId: ctx.teamId,
        boneId: parsed.data.boneId,
        transform: result.transform,
        playerId,
      }),
    );
  });

  socket.on("puzzle:place", (req, ack) => {
    if (!placeLimiter.tryConsume(socket.id)) {
      return ack(ackErr(req?.requestId ?? "unknown", "RATE_LIMITED", "too many puzzle:place attempts", true));
    }
    const parsed = puzzlePlaceRequestSchema.safeParse(req);
    if (!parsed.success) return ack(ackErr(req?.requestId ?? "unknown", "INVALID_PAYLOAD", parsed.error.message, true));

    const roomCode = socket.data.roomCode;
    const playerId = socket.data.playerId;
    if (socket.data.role !== "PLAYER" || !roomCode || !playerId) {
      return ack(ackErr(parsed.data.requestId, "PLAYER_NOT_JOINED", "join a room first", false));
    }
    const ctx = playerTeam(rooms, roomCode, playerId);
    if (!ctx) return ack(ackErr(parsed.data.requestId, "ROOM_NOT_FOUND", "room no longer exists", false));

    const now = Date.now();
    const result = rooms.applyPuzzlePlace(
      ctx.room,
      ctx.teamId,
      playerId,
      parsed.data.boneId,
      parsed.data.claimToken,
      parsed.data.transform,
      now,
    );
    if (!result.ok) {
      return ack(ackErr(parsed.data.requestId, result.error, `puzzle:place rejected: ${result.error}`, false));
    }

    ack(
      ackOk(parsed.data.requestId, {
        boneId: result.boneId,
        correct: result.correct,
        fixedTransform: result.fixedTransform,
        lockedUntil: result.lockedUntil,
        teamPhase: result.teamPhase,
      }),
    );

    const channel = roomChannel(roomCode);
    io.to(channel).emit(
      "puzzle:piecePlaced",
      toServerEvent(roomCode, ctx.room.state.revision, {
        teamId: ctx.teamId,
        boneId: result.boneId,
        correct: result.correct,
        teamPhase: result.teamPhase,
      }),
    );

    if (result.phaseCompleted) {
      const team = ctx.room.state.teams[ctx.teamId];
      io.to(channel).emit(
        "team:phaseChanged",
        toServerEvent(roomCode, ctx.room.state.revision, {
          teamId: ctx.teamId,
          from: "ASSEMBLY",
          to: "CHARGING",
          endsAt: team.phaseEndsAt,
        }),
      );
      broadcastRoomState(io, rooms, roomCode);
    }
  });
}

/** 5초 무입력 조작권 자동 해제를 배경에서 능동적으로 스윕한다. */
export function sweepPuzzleClaims(io: AppServer, rooms: RoomManager, roomCode: string): void {
  const room = rooms.getRoom(roomCode);
  if (!room || room.state.roomPhase !== "PLAYING") return;
  const now = Date.now();
  for (const teamId of ["A", "B"] as const) {
    if (room.state.teams[teamId].phase !== "ASSEMBLY") continue;
    const released = rooms.releaseExpiredPuzzleClaims(room, teamId, now);
    for (const boneId of released) {
      io.to(roomChannel(roomCode)).emit(
        "puzzle:claimChanged",
        toServerEvent(roomCode, room.state.revision, { teamId, boneId, claimedBy: null, expiresAt: null }),
      );
    }
  }
}
