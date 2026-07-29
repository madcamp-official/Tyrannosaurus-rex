/** 실제 서버 데이터(RoomState + ephemeral 소켓 이벤트)를 BattleScreen이 요구하는 BattleState로 변환한다. */

import { ENERGY_TARGET, type CoreZone, type PublicPlayer, type RoomState, type TeamId, type TeamState } from "@trex/shared";
import type { ChargingEphemeral } from "../desktop/PlayArea";
import type { BattlePlayer, BattleState, BattleTeam } from "./battleTypes";

const CORE_LABEL: Record<CoreZone, string> = { HEART: "심장", SKULL: "두개골", SPINE: "척추" };

function stageFor(avgEnergy: number): number {
  if (avgEnergy >= 75) return 4;
  if (avgEnergy >= 50) return 3;
  if (avgEnergy >= 25) return 2;
  return 1;
}

function teamFrom(allPlayers: PublicPlayer[], team: TeamState, teamName: string): BattleTeam {
  const teamPlayers = allPlayers.filter((p) => p.teamId === team.id);
  const battlePlayers: BattlePlayer[] = teamPlayers.map((p) => ({
    id: p.id,
    name: p.nickname,
    shots: p.stats.shots,
    hits: p.stats.hits,
    energy: p.stats.energyContributed,
  }));
  return {
    name: teamName,
    players: battlePlayers,
    energy: team.charging.energy,
    totalHits: teamPlayers.reduce((sum, p) => sum + p.stats.hits, 0),
    coreHits: teamPlayers.reduce((sum, p) => sum + p.stats.coreHits, 0),
    result: team.charging.result,
  };
}

/** 충전 중인 팀이 하나도 없으면(아직 사격 단계 진입 전 등) null을 돌려준다. */
export function battleStateFromRoom(
  roomState: RoomState,
  ephemeral: ChargingEphemeral,
  chargingTeamIds: readonly TeamId[],
): BattleState | null {
  if (chargingTeamIds.length === 0) return null;

  // 스켈레톤은 방에 하나뿐이라, 먼저 CHARGING에 들어간 팀의 트렉스 데이터를 그대로 쓰면 된다(§2.3).
  const primaryTeamId = chargingTeamIds[0]!;
  // 첫 trex:transform 이벤트가 누락되거나 늦어져도 예전 Godot 사격 화면에 계속
  // 머물지 않도록 중앙 기본값으로 즉시 배틀 화면을 연다. 서버 좌표가 도착하면 같은
  // BattleState 경로에서 자연스럽게 실제 위치를 이어받는다.
  const trex = ephemeral.trexByTeam[primaryTeamId] ?? {
    position: { x: 0.5, y: 0.5 },
    facing: "RIGHT" as const,
    activeCore: roomState.teams[primaryTeamId].charging.activeCore,
    corePosition: { x: 0.5, y: 0.5 },
  };

  const now = Date.now();
  const remainingSec = Math.min(
    ...chargingTeamIds.map((teamId) => {
      const endsAt = roomState.teams[teamId].phaseEndsAt;
      return endsAt !== null ? Math.max(0, (endsAt - now) / 1000) : Number.POSITIVE_INFINITY;
    }),
  );

  const teamA = teamFrom(roomState.players, roomState.teams.A, roomState.teamNames.A);
  const teamB = teamFrom(roomState.players, roomState.teams.B, roomState.teamNames.B);

  return {
    remainingSec: Number.isFinite(remainingSec) ? remainingSec : 0,
    coreName: CORE_LABEL[trex.activeCore],
    stage: stageFor((teamA.energy + teamB.energy) / 2),
    siteName: roomState.roomName,
    energyTarget: ENERGY_TARGET,
    teamA,
    teamB,
    trex: {
      x: trex.position.x,
      y: trex.position.y,
      facing: trex.facing === "LEFT" ? -1 : 1,
      corePos: [trex.corePosition.x, trex.corePosition.y],
    },
  };
}
