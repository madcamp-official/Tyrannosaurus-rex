/** Plan.md §17.6, §18. 운석 피하기 좌우 위치 갱신과 배경 틱(충돌 판정·1분 종료). */

import { DINO_POSITION_UPDATE_MAX_HZ, TEAM_IDS, dinoPositionInputSchema } from "@trex/shared";
import type { RoomManager } from "./RoomManager.js";
import type { AppServer, AppSocket } from "./types.js";
import { roomChannel } from "./channels.js";
import { broadcastRoomState, toServerEvent } from "./broadcast.js";
import { TokenBucketLimiter } from "../validation/rateLimit.js";

const positionLimiter = new TokenBucketLimiter(DINO_POSITION_UPDATE_MAX_HZ, DINO_POSITION_UPDATE_MAX_HZ);

export function registerDinoHandlers(io: AppServer, socket: AppSocket, rooms: RoomManager): void {
  // 조준(aim:update)과 같은 패턴 — 고빈도, acknowledgement 없이 보낸다.
  socket.on("dino:position", (input) => {
    if (socket.data.role !== "PLAYER") return;
    const roomCode = socket.data.roomCode;
    const playerId = socket.data.playerId;
    if (!roomCode || !playerId) return;
    if (!positionLimiter.tryConsume(socket.id)) return;

    const parsed = dinoPositionInputSchema.safeParse(input);
    if (!parsed.success) return;

    const room = rooms.getRoom(roomCode);
    const player = room?.state.players.find((p) => p.id === playerId);
    if (!room || !player) return;

    rooms.applyDinoPositionInput(room, player.teamId, playerId, parsed.data, Date.now());
  });
}

/** 100ms 배경 틱: 낙하 시각이 지난 오브젝트를 판정하고(운석 명중/보너스/탈락), 1분이 끝난 팀을 평가한다. */
export function tickRoomDinoRun(io: AppServer, rooms: RoomManager, roomCode: string): void {
  const room = rooms.getRoom(roomCode);
  if (!room || room.state.roomPhase !== "PLAYING") return;

  const channel = roomChannel(roomCode);
  const now = Date.now();

  const collisions = rooms.tickDinoCollisions(room, now);
  for (const { teamId, event } of collisions) {
    if (event.kind === "HIT") {
      io.to(channel).emit(
        "dino:hit",
        toServerEvent(roomCode, room.state.revision, {
          teamId,
          playerId: event.playerId,
          objectId: event.objectId,
          livesLeft: event.livesLeft,
          score: event.score,
          x: event.x,
        }),
      );
    } else if (event.kind === "BONUS") {
      io.to(channel).emit(
        "dino:bonus",
        toServerEvent(roomCode, room.state.revision, {
          teamId,
          playerId: event.playerId,
          objectId: event.objectId,
          kind: event.pickupKind,
          livesLeft: event.livesLeft,
          score: event.score,
          x: event.x,
        }),
      );
    } else {
      io.to(channel).emit(
        "dino:playerDied",
        toServerEvent(roomCode, room.state.revision, { teamId, playerId: event.playerId }),
      );
    }
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
  // 실제 CHARGING_PRACTICE 전환은 tickDinoRunHandoff가 ROUND_TRANSITION_MS를 기다렸다가 처리한다.
  for (const teamResult of teamResults) {
    io.to(channel).emit("dino:teamResult", toServerEvent(roomCode, room.state.revision, teamResult));
  }
  if (collisions.length > 0 || finished.length > 0 || teamResults.length > 0) {
    broadcastRoomState(io, rooms, roomCode);
  }
}

/**
 * 100ms 배경 틱: 두 팀 다 운석 피하기를 끝내고 대기 시간이 지나면 함께 CHARGING_PRACTICE(영점
 * 조정 연습)로 전환한다. 연습 시간이 끝난 팀은 실제 CHARGING으로 전환한다.
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
