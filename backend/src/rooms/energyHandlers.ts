/** Plan.md §17.10, §18. 사격 판정과 배경 충전 틱(10Hz) 브로드캐스트. */

import { energyFireRequestSchema, totalGameScore } from "@trex/shared";
import type { RoomManager, ChargingTickUpdate } from "./RoomManager.js";
import type { AppServer, AppSocket } from "./types.js";
import { roomChannel } from "./channels.js";
import { broadcastRoomState, toServerEvent } from "./broadcast.js";
import { ackErr, ackOk } from "../validation/ack.js";
import { TokenBucketLimiter } from "../validation/rateLimit.js";
import { computeMvpRanking } from "../game/mvp.js";
import { CORE_OFFSETS } from "../game/charging.js";

const fireLimiter = new TokenBucketLimiter(4, 4);

export function registerEnergyHandlers(io: AppServer, socket: AppSocket, rooms: RoomManager): void {
  socket.on("energy:fire", (req, ack) => {
    if (!fireLimiter.tryConsume(socket.id)) {
      return ack(ackErr(req?.requestId ?? "unknown", "RATE_LIMITED", "too many energy:fire attempts", true));
    }
    const parsed = energyFireRequestSchema.safeParse(req);
    if (!parsed.success) return ack(ackErr(req?.requestId ?? "unknown", "INVALID_PAYLOAD", parsed.error.message, true));

    const roomCode = socket.data.roomCode;
    const playerId = socket.data.playerId;
    if (socket.data.role !== "PLAYER" || !roomCode || !playerId) {
      return ack(ackErr(parsed.data.requestId, "PLAYER_NOT_JOINED", "join a room first", false));
    }
    const room = rooms.getRoom(roomCode);
    const player = room?.state.players.find((p) => p.id === playerId);
    if (!room || !player) return ack(ackErr(parsed.data.requestId, "ROOM_NOT_FOUND", "room no longer exists", false));

    const now = Date.now();
    const outcome = rooms.fireEnergy(room, player.teamId, playerId, parsed.data.shotId, now);
    if (!outcome.accepted) {
      const code = outcome.reason === "WRONG_TEAM_PHASE" ? "WRONG_TEAM_PHASE" : (outcome.reason ?? "SERVER_ERROR");
      const retryable = code !== "DUPLICATE_REQUEST" && code !== "WRONG_TEAM_PHASE";
      return ack(ackErr(parsed.data.requestId, code, `energy:fire rejected: ${outcome.reason}`, retryable));
    }

    const responseData = {
      shotId: parsed.data.shotId,
      accepted: true,
      hit: outcome.hit,
      hitZone: outcome.hitZone,
      energyDelta: outcome.energyDelta,
      stabilityDelta: outcome.stabilityDelta,
      energyAfter: outcome.energyAfter,
      stabilityAfter: outcome.stabilityAfter,
      teamPhaseAfter: outcome.teamPhaseAfter,
    };
    ack(ackOk(parsed.data.requestId, responseData));

    const channel = roomChannel(roomCode);
    io.to(channel).emit(
      "energy:shotResolved",
      toServerEvent(roomCode, room.state.revision, {
        ...responseData,
        playerId,
        teamId: player.teamId,
        aimPoint: outcome.aimPoint ?? { x: 0.5, y: 0.5 },
        hitPoint: outcome.hitPoint,
      }),
    );

    if (outcome.justReachedRevived) {
      io.to(channel).emit(
        "revival:formChanged",
        toServerEvent(roomCode, room.state.revision, {
          teamId: player.teamId,
          form: room.state.teams[player.teamId].charging.form,
          energy: outcome.energyAfter,
          stability: outcome.stabilityAfter,
        }),
      );
    }

    broadcastResultIfFinalized(io, rooms, roomCode, outcome.roundFinalized);
  });
}

export function broadcastResultIfFinalized(io: AppServer, rooms: RoomManager, roomCode: string, finalized: boolean): void {
  if (!finalized) return;
  const room = rooms.getRoom(roomCode);
  if (!room) return;
  const channel = roomChannel(roomCode);

  io.to(channel).emit(
    "game:result",
    toServerEvent(roomCode, room.state.revision, {
      winnerTeamId: room.state.winner.teamId,
      reason: room.state.winner.reason,
      finishedAt: Date.now(),
      teams: (["A", "B"] as const).map((teamId) => {
        const team = room.state.teams[teamId];
        const durations = room.phaseDurations[teamId];
        return {
          teamId,
          form: team.charging.form,
          energy: team.charging.energy,
          stability: team.charging.stability,
          excavationMs: durations.excavationMs,
          assemblyMs: durations.assemblyMs,
          chargingMs: durations.chargingMs,
          scores: team.scores,
          totalScore: totalGameScore(team.scores),
        };
      }),
      players: room.state.players,
      mvp: computeMvpRanking(room.state.players),
    }),
  );
  broadcastRoomState(io, rooms, roomCode);
}

/** 100ms 간격 배경 틱: 10Hz 티라노 위치, 코어 로테이션, 시간 초과 처리. */
export function tickRoomCharging(io: AppServer, rooms: RoomManager, roomCode: string): void {
  const room = rooms.getRoom(roomCode);
  if (!room || room.state.roomPhase !== "PLAYING") return;
  const now = Date.now();

  const { updates, roundFinalized } = rooms.tickCharging(room, now);
  const channel = roomChannel(roomCode);

  for (const update of updates) {
    const coreOffset = CORE_OFFSETS[update.core];
    io.to(channel).emit(
      "trex:transform",
      toServerEvent(roomCode, room.state.revision, {
        teamId: update.teamId,
        position: update.transform.position,
        rotationDeg: update.transform.rotationDeg,
        facing: update.transform.facing,
        poseId: update.transform.poseId,
        effectiveAt: now,
        activeCore: update.core,
        corePosition: { x: update.transform.position.x + coreOffset.x, y: update.transform.position.y + coreOffset.y },
      }),
    );

    if (update.coreChanged) {
      io.to(channel).emit(
        "energy:coreChanged",
        toServerEvent(roomCode, room.state.revision, {
          teamId: update.teamId,
          from: update.core,
          to: update.core,
          nextChangeAt: update.nextChangeAt,
        }),
      );
    }

    emitTransitionEvents(io, rooms, roomCode, update);
  }

  // 두 팀 모두 EXCAVATION/ASSEMBLY에 머물러 있어도 라운드 시간 초과는 검사되어야 한다.
  const finalized = roundFinalized || rooms.checkRoundCompletion(room, now);
  broadcastResultIfFinalized(io, rooms, roomCode, finalized);
}

function emitTransitionEvents(io: AppServer, rooms: RoomManager, roomCode: string, update: ChargingTickUpdate): void {
  const room = rooms.getRoom(roomCode);
  if (!room || update.transition !== "TO_REVIVED_YRANNO") return;
  const channel = roomChannel(roomCode);
  const team = room.state.teams[update.teamId];

  io.to(channel).emit(
    "team:phaseChanged",
    toServerEvent(roomCode, room.state.revision, { teamId: update.teamId, from: "CHARGING", to: "REVIVED", endsAt: null }),
  );
  io.to(channel).emit(
    "revival:formChanged",
    toServerEvent(roomCode, room.state.revision, {
      teamId: update.teamId,
      form: team.charging.form,
      energy: team.charging.energy,
      stability: team.charging.stability,
    }),
  );
  broadcastRoomState(io, rooms, roomCode);
}
