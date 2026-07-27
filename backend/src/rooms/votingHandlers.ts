/** Plan.md §8. 결과 화면 대기 창(투표 기능 없음) 마감 처리와 박물관 저장. */

import { randomUUID } from "node:crypto";
import type { RoomManager, RoomRecord } from "./RoomManager.js";
import { computeMvpRanking } from "../game/mvp.js";
import { insertMuseumEntry } from "../db/museumDb.js";

/** 배경 틱에서 호출: 결과 화면 대기 시각이 지난 방을 확정하고 박물관에 기록한다. */
export function finalizeVotingTick(rooms: RoomManager, roomCode: string): void {
  const room = rooms.getRoom(roomCode);
  if (!room) return;
  const finalized = rooms.finalizeVotingIfDue(room, Date.now());
  if (!finalized) return;

  for (const teamId of ["A", "B"] as const) {
    saveMuseumEntry(room, teamId);
  }
}

/** Plan.md §8. 결과 화면 대기가 끝난 시점에만 그 팀의 티라노를 박물관 DB에 기록한다. */
function saveMuseumEntry(room: RoomRecord, teamId: "A" | "B"): void {
  const team = room.state.teams[teamId];
  const members = room.state.players.filter((p) => p.teamId === teamId);
  const totalShots = members.reduce((sum, p) => sum + p.stats.shots, 0);
  const totalHits = members.reduce((sum, p) => sum + p.stats.hits, 0);
  const [mvp] = computeMvpRanking(members);

  insertMuseumEntry({
    id: randomUUID(),
    roomName: room.state.roomName,
    teamId,
    isWinner: room.state.winner.teamId === teamId,
    form: team.charging.form,
    tyrannoName: null,
    teamMembers: members.map((p) => p.nickname),
    mvpNickname: mvp ? mvp.nickname : null,
    mvpScore: mvp ? mvp.score : null,
    decorations: room.decorationSelections[teamId],
    excavationMs: room.phaseDurations[teamId].excavationMs,
    assemblyMs: room.phaseDurations[teamId].assemblyMs,
    chargingMs: room.phaseDurations[teamId].chargingMs,
    accuracy: totalShots > 0 ? totalHits / totalShots : 0,
    fossils: team.excavation.fossils,
    createdAt: Date.now(),
  });
}
