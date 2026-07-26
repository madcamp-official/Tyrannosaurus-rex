/** Plan.md §17.5, §18. 뼈 발굴 고빈도 이벤트 핸들러. acknowledgement가 없다 (§16.3). */

import { excavateInputSchema } from "@trex/shared";
import type { RoomManager } from "./RoomManager.js";
import type { AppServer, AppSocket } from "./types.js";
import { roomChannel } from "./channels.js";
import { toServerEvent } from "./broadcast.js";

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
          efficiencyMultiplier: team.excavation.efficiencyMultiplier,
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

    if (result.phaseCompleted) {
      io.to(channel).emit(
        "team:phaseChanged",
        toServerEvent(roomCode, room.state.revision, {
          teamId,
          from: "EXCAVATION",
          to: "ASSEMBLY",
          endsAt: team.phaseEndsAt,
        }),
      );
      io.to(channel).emit(
        "dino:started",
        toServerEvent(roomCode, room.state.revision, {
          teamId,
          obstacleOffsetsMs: team.dinoRun.obstacleOffsetsMs,
          startedAt: team.phaseStartedAt,
          endsAt: team.phaseEndsAt ?? 0,
        }),
      );
      io.to(channel).emit("room:state", toServerEvent(roomCode, room.state.revision, rooms.getPublicState(room)));
    }
  });
}
