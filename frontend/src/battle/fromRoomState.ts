/** 실제 서버 데이터(RoomState + ephemeral 소켓 이벤트)를 BattleScreen이 요구하는 BattleState로 변환한다. */

import { CHARGING_DURATION_MS, CHARGING_STAGE_DURATION_MS, CHARGING_STAGE_INTRO_MS, ENERGY_TARGET_PER_PLAYER, FINAL_STAGE_CORE_TIMEOUT_MS, type CoreZone, type PublicPlayer, type RoomState, type TeamId, type TeamState, type TeamStyle } from "@trex/shared";
import type { ChargingEphemeral } from "../desktop/PlayArea";
import type { BattlePlayer, BattleState, BattleTeam } from "./battleTypes";

const CORE_LABEL: Record<CoreZone, string> = { HEART: "심장", SKULL: "두개골", SPINE: "척추" };

function stageFor(avgEnergy: number): number {
  if (avgEnergy >= 75) return 4;
  if (avgEnergy >= 50) return 3;
  if (avgEnergy >= 25) return 2;
  return 1;
}

function teamFrom(allPlayers: PublicPlayer[], team: TeamState, teamName: string, teamStyle: TeamStyle): BattleTeam {
  const teamPlayers = allPlayers.filter((p) => p.teamId === team.id);
  const battlePlayers: BattlePlayer[] = teamPlayers.map((p) => ({
    id: p.id,
    name: p.nickname,
    shots: p.stats.shots,
    hits: p.stats.hits,
    energy: p.stats.energyContributed + (p.stats.chargingTimeBonus ?? 0),
    color: p.color,
  }));
  return {
    name: teamName,
    ...teamStyle,
    players: battlePlayers,
    // 팀 점수는 서버의 부활 게이지(단계별 상한 적용)가 아니라 화면에 표시되는
    // 유저별 기여 점수의 합계와 정확히 일치해야 한다.
    energy: battlePlayers.reduce((sum, player) => sum + player.energy, 0),
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

  const teamA = teamFrom(roomState.players, roomState.teams.A, roomState.teamNames.A, roomState.teamStyles.A);
  const teamB = teamFrom(roomState.players, roomState.teams.B, roomState.teamNames.B, roomState.teamStyles.B);
  const chargingStage = trex.chargingStage ?? 1;
  const elapsedMs = Math.max(0, CHARGING_DURATION_MS - remainingSec * 1000);
  const stageElapsedMs = elapsedMs % CHARGING_STAGE_DURATION_MS;
  const stageProgress = Math.min(1, stageElapsedMs / CHARGING_STAGE_DURATION_MS);
  const finalStatusFor = (teamId: TeamId) => {
    const teamTrex = ephemeral.trexByTeam[teamId];
    const deadline = teamTrex?.finalCoreDeadlineAt ?? roomState.teams[teamId].charging.finalCoreDeadlineAt;
    return {
      lives: teamTrex?.finalLives ?? roomState.teams[teamId].charging.finalLives ?? 5,
      secondsLeft: deadline
        ? Math.max(0, Math.ceil((deadline - now) / 1000))
        : FINAL_STAGE_CORE_TIMEOUT_MS / 1000,
    };
  };
  const finalA = finalStatusFor("A");
  const finalB = finalStatusFor("B");

  return {
    remainingSec: Number.isFinite(remainingSec) ? remainingSec : 0,
    coreName: CORE_LABEL[trex.activeCore],
    stage: stageFor((teamA.energy + teamB.energy) / 2),
    siteName: roomState.roomName,
    teamAEnergyTarget: Math.max(1, teamA.players.length) * ENERGY_TARGET_PER_PLAYER,
    teamBEnergyTarget: Math.max(1, teamB.players.length) * ENERGY_TARGET_PER_PLAYER,
    chargingStage,
    stageProgress,
    stageIntroActive: stageElapsedMs < CHARGING_STAGE_INTRO_MS,
    teamAFinalLives: finalA.lives,
    teamBFinalLives: finalB.lives,
    teamAFinalSecondsLeft: finalA.secondsLeft,
    teamBFinalSecondsLeft: finalB.secondsLeft,
    teamAStunned: (ephemeral.trexByTeam.A?.finalStunnedUntil ?? 0) > now,
    teamBStunned: (ephemeral.trexByTeam.B?.finalStunnedUntil ?? 0) > now,
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
