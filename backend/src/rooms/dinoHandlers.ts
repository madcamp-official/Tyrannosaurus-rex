/** Plan.md §17.6, §18. 다이노런 점프 판정과 30초 종료 배경 틱. */

import { DINO_JUMP_MAX_PER_SECOND, TEAM_IDS, dinoJumpRequestSchema } from "@trex/shared";
import type { RoomManager } from "./RoomManager.js";
import type { AppServer, AppSocket } from "./types.js";
import { roomChannel } from "./channels.js";
import { broadcastRoomState, toServerEvent } from "./broadcast.js";
import { ackErr, ackOk } from "../validation/ack.js";
import { TokenBucketLimiter } from "../validation/rateLimit.js";

const jumpLimiter = new TokenBucketLimiter(DINO_JUMP_MAX_PER_SECOND, DINO_JUMP_MAX_PER_SECOND);

export function registerDinoHandlers(io: AppServer, socket: AppSocket, rooms: RoomManager): void {
  socket.on("dino:jump", (req, ack) => {
    if (!jumpLimiter.tryConsume(socket.id)) {
      return ack(ackErr(req?.requestId ?? "unknown", "RATE_LIMITED", "too many dino:jump attempts", true));
    }
    const parsed = dinoJumpRequestSchema.safeParse(req);
    if (!parsed.success) return ack(ackErr(req?.requestId ?? "unknown", "INVALID_PAYLOAD", parsed.error.message, true));

    const roomCode = socket.data.roomCode;
    const playerId = socket.data.playerId;
    if (socket.data.role !== "PLAYER" || !roomCode || !playerId) {
      return ack(ackErr(parsed.data.requestId, "PLAYER_NOT_JOINED", "join a room first", false));
    }
    const room = rooms.getRoom(roomCode);
    const player = room?.state.players.find((p) => p.id === playerId);
    if (!room || !player) return ack(ackErr(parsed.data.requestId, "ROOM_NOT_FOUND", "room no longer exists", false));

    const outcome = rooms.applyDinoJumpInput(room, player.teamId, playerId, Date.now());
    if (!outcome.accepted) {
      return ack(ackErr(parsed.data.requestId, "WRONG_TEAM_PHASE", "dino run is not active", false));
    }

    ack(ackOk(parsed.data.requestId, { cleared: outcome.cleared, obstacleIndex: outcome.obstacleIndex, clearedCount: outcome.clearedCount }));

    if (outcome.cleared && outcome.obstacleIndex !== null) {
      io.to(roomChannel(roomCode)).emit(
        "dino:progress",
        toServerEvent(roomCode, room.state.revision, {
          teamId: player.teamId,
          playerId,
          obstacleIndex: outcome.obstacleIndex,
          clearedCount: outcome.clearedCount,
        }),
      );
    }
  });
}

/** 100ms 배경 틱: 놓친 장애물로 탈락한 플레이어를 알리고, 30초가 끝난 팀을 평가한다. */
export function tickRoomDinoRun(io: AppServer, rooms: RoomManager, roomCode: string): void {
  const room = rooms.getRoom(roomCode);
  if (!room || room.state.roomPhase !== "PLAYING") return;

  const channel = roomChannel(roomCode);
  const now = Date.now();

  const died = rooms.tickDinoDeaths(room, now);
  for (const { teamId, playerId } of died) {
    io.to(channel).emit("dino:playerDied", toServerEvent(roomCode, room.state.revision, { teamId, playerId }));
  }

  const { finished, teamResults } = rooms.tickDinoRun(room, now);
  for (const { teamId, result } of finished) {
    io.to(channel).emit(
      "dino:finished",
      toServerEvent(roomCode, room.state.revision, {
        teamId,
        performance: result.performance,
        grade: result.grade,
        startStability: result.startStability,
      }),
    );
  }
  // 먼저 끝난 팀은 조용히 상대를 기다리고, 두 팀 다 끝나면 WIN/LOSE/DRAW를 함께 알린다.
  // 실제 CHARGING 전환은 tickDinoRunHandoff가 ROUND_TRANSITION_MS를 기다렸다가 처리한다.
  for (const teamResult of teamResults) {
    io.to(channel).emit("dino:teamResult", toServerEvent(roomCode, room.state.revision, teamResult));
  }
  if (finished.length > 0 || teamResults.length > 0) {
    broadcastRoomState(io, rooms, roomCode);
  }
}

/**
 * 100ms 배경 틱: 두 팀 다 다이노런을 끝내고 대기 시간이 지나면 함께 CHARGING_PRACTICE(영점
 * 조정 연습)로 전환한다. 연습 10초가 끝난 팀은 실제 CHARGING으로 전환한다.
 */
export function tickDinoRunHandoff(io: AppServer, rooms: RoomManager, roomCode: string): void {
  const room = rooms.getRoom(roomCode);
  if (!room || room.state.roomPhase !== "PLAYING") return;

  const channel = roomChannel(roomCode);
  const now = Date.now();
  let changed = false;

  const transitioned = rooms.tickDinoRunTransition(room, now);
  if (transitioned) {
    changed = true;
    for (const teamId of TEAM_IDS) {
      io.to(channel).emit(
        "team:phaseChanged",
        toServerEvent(roomCode, room.state.revision, {
          teamId,
          from: "ASSEMBLY",
          to: "CHARGING_PRACTICE",
          endsAt: room.state.teams[teamId].phaseEndsAt,
        }),
      );
    }
  }

  const practiceFinished = rooms.tickChargingPractice(room, now);
  if (practiceFinished.length > 0) {
    changed = true;
    for (const teamId of practiceFinished) {
      io.to(channel).emit(
        "team:phaseChanged",
        toServerEvent(roomCode, room.state.revision, {
          teamId,
          from: "CHARGING_PRACTICE",
          to: "CHARGING",
          endsAt: room.state.teams[teamId].phaseEndsAt,
        }),
      );
    }
  }

  if (changed) broadcastRoomState(io, rooms, roomCode);
}
