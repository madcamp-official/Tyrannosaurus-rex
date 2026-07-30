/** Plan.md §17.5, §18. 뼈 발굴 고빈도 이벤트 핸들러. acknowledgement가 없다 (§16.3). */

import {
  EXCAVATION_DUST_ATTACK_CHARGE,
  EXCAVATION_DUST_ATTACK_COOLDOWN_MS,
  EXCAVATION_DUST_ATTACK_DURATION_MS,
  TEAM_IDS,
  excavateInputSchema,
  excavationDustAttackRequestSchema,
} from "@trex/shared";
import type { RoomManager } from "./RoomManager.js";
import type { AppServer, AppSocket } from "./types.js";
import { roomChannel } from "./channels.js";
import { broadcastRoomState, toServerEvent } from "./broadcast.js";
import { ackErr, ackOk } from "../validation/ack.js";

export function registerExcavationHandlers(io: AppServer, socket: AppSocket, rooms: RoomManager): void {
  socket.on("excavate:input", (rawInput) => {
    if (socket.data.role !== "PLAYER") return;
    const roomCode = socket.data.roomCode;
    const playerId = socket.data.playerId;
    if (!roomCode || !playerId) return;

    const parsed = excavateInputSchema.safeParse(rawInput);
    if (!parsed.success) return;

    const room = rooms.getRoom(roomCode);
    if (!room) return;
    const player = room.state.players.find((p) => p.id === playerId);
    if (!player) return;
    const teamId = player.teamId;

    const now = Date.now();
    const result = rooms.applyExcavation(room, teamId, playerId, parsed.data, now);
    if (!result.accepted) return;

    const team = room.state.teams[teamId];
    const channel = roomChannel(roomCode);

    if (result.pointsAdded > 0 || result.event || result.boneAwards.length > 0) {
      io.to(channel).emit(
        "excavation:progress",
        toServerEvent(roomCode, room.state.revision, {
          teamId,
          points: team.excavation.points,
          nextBoneAt: team.excavation.nextBoneAt,
          playerId,
          playerInputs: player.stats.excavationInputs,
        }),
      );
      io.to(channel).emit(
        "excavation:dustCharge",
        toServerEvent(roomCode, room.state.revision, {
          teamId,
          charge: team.excavation.dustCharge,
          cooldownUntil: team.excavation.dustCooldownUntil,
        }),
      );
    }

    for (const boneId of result.boneAwards) {
      io.to(channel).emit(
        "excavation:boneFound",
        toServerEvent(roomCode, room.state.revision, {
          teamId,
          boneId,
          index: team.excavation.discoveredBoneIds.indexOf(boneId),
        }),
      );
    }

    if (result.event) {
      io.to(channel).emit(
        "excavation:eventTriggered",
        toServerEvent(roomCode, room.state.revision, { teamId, kind: result.event.kind, endsAt: result.event.endsAt }),
      );
    }

    // 먼저 끝난 팀은 WIN, 나중에 끝난 팀은 LOSE — 단 거의 동시에 끝나면 둘 다 DRAW로 정정되어
    // 알림이 두 팀 몫으로 온다. 실제 다이노런 전환은 tickExcavationHandoff가 두 팀 다 끝난 뒤
    // ROUND_TRANSITION_MS를 기다렸다가 함께 처리한다.
    if (result.teamResults.length > 0) {
      for (const teamResult of result.teamResults) {
        io.to(channel).emit("excavation:teamFinished", toServerEvent(roomCode, room.state.revision, teamResult));
      }
      io.to(channel).emit("room:state", toServerEvent(roomCode, room.state.revision, rooms.getPublicState(room)));
    }
  });

  socket.on("excavation:dustAttack", (rawRequest, ack) => {
    const parsed = excavationDustAttackRequestSchema.safeParse(rawRequest);
    if (!parsed.success) {
      return ack(ackErr(rawRequest?.requestId ?? "unknown", "INVALID_PAYLOAD", parsed.error.message, false));
    }
    const { requestId } = parsed.data;
    if (socket.data.role !== "PLAYER" || !socket.data.roomCode || !socket.data.playerId) {
      return ack(ackErr(requestId, "PLAYER_NOT_JOINED", "player is not joined", false));
    }

    const room = rooms.getRoom(socket.data.roomCode);
    const player = room?.state.players.find((candidate) => candidate.id === socket.data.playerId);
    if (!room || !player) {
      return ack(ackErr(requestId, "ROOM_NOT_FOUND", "room not found", false));
    }

    const now = Date.now();
    const attacker = room.state.teams[player.teamId];
    const targetTeamId = player.teamId === "A" ? "B" : "A";
    const target = room.state.teams[targetTeamId];
    if (
      attacker.phase !== "EXCAVATION" ||
      target.phase !== "EXCAVATION" ||
      attacker.excavation.result !== null ||
      target.excavation.result !== null
    ) {
      return ack(ackErr(requestId, "WRONG_TEAM_PHASE", "dust attack is unavailable", false));
    }
    if (
      attacker.excavation.dustCharge < EXCAVATION_DUST_ATTACK_CHARGE ||
      (attacker.excavation.dustCooldownUntil ?? 0) > now
    ) {
      return ack(ackErr(requestId, "RATE_LIMITED", "dust attack is not charged", true));
    }

    const disruptedUntil = now + EXCAVATION_DUST_ATTACK_DURATION_MS;
    attacker.excavation.dustCharge = 0;
    attacker.excavation.dustCooldownUntil = now + EXCAVATION_DUST_ATTACK_COOLDOWN_MS;
    target.excavation.disruptedUntil = Math.max(target.excavation.disruptedUntil ?? 0, disruptedUntil);
    const channel = roomChannel(room.state.roomCode);
    io.to(channel).emit(
      "excavation:dustCharge",
      toServerEvent(room.state.roomCode, room.state.revision, {
        teamId: player.teamId,
        charge: 0,
        cooldownUntil: attacker.excavation.dustCooldownUntil,
      }),
    );
    io.to(channel).emit(
      "excavation:dustAttacked",
      toServerEvent(room.state.roomCode, room.state.revision, {
        attackerTeamId: player.teamId,
        targetTeamId,
        attackerPlayerId: player.id,
        attackerNickname: player.nickname,
        disruptedUntil,
      }),
    );
    broadcastRoomState(io, rooms, room.state.roomCode);
    return ack(ackOk(requestId, { targetTeamId, disruptedUntil }));
  });
}

/** 100ms 배경 틱: 두 팀 다 발굴을 끝내고 대기 시간이 지나면 함께 영점 조정 연습으로 전환한다. */
export function tickExcavationHandoff(io: AppServer, rooms: RoomManager, roomCode: string): void {
  const room = rooms.getRoom(roomCode);
  if (!room || room.state.roomPhase !== "PLAYING") return;

  const transitioned = rooms.tickExcavationTransition(room, Date.now());
  if (!transitioned) return;

  const channel = roomChannel(roomCode);
  for (const teamId of TEAM_IDS) {
    const team = room.state.teams[teamId];
    io.to(channel).emit(
      "team:phaseChanged",
      toServerEvent(roomCode, room.state.revision, {
        teamId,
        from: "EXCAVATION",
        to: "CHARGING_PRACTICE",
        startedAt: team.phaseStartedAt,
        endsAt: team.phaseEndsAt,
      }),
    );
  }
  broadcastRoomState(io, rooms, roomCode);
}
