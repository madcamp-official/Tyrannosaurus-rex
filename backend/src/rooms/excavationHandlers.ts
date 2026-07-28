/** Plan.md §17.5, §18. 뼈 발굴 고빈도 이벤트 핸들러. acknowledgement가 없다 (§16.3). */

import { TEAM_IDS, excavateInputSchema } from "@trex/shared";
import type { RoomManager } from "./RoomManager.js";
import type { AppServer, AppSocket } from "./types.js";
import { roomChannel } from "./channels.js";
import { broadcastRoomState, toServerEvent } from "./broadcast.js";

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
}

/** 100ms 배경 틱: 두 팀 다 발굴을 끝내고 대기 시간이 지나면 함께 다이노런으로 전환한다. */
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
      toServerEvent(roomCode, room.state.revision, { teamId, from: "EXCAVATION", to: "ASSEMBLY", endsAt: team.phaseEndsAt }),
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
  }
  broadcastRoomState(io, rooms, roomCode);
}
