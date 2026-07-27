/**
 * Plan.md §0.3 "고빈도 입력과 저빈도 전체 상태를 별도 이벤트로 나눈다".
 * room:state는 구조 변화(팀 배정, phase 전환)에만 오고, 발굴·다이노런처럼 잦은 갱신은
 * 전용 이벤트로 온다. 데스크탑·모바일 모두 이 이벤트들을 로컬 RoomState에 합성해서 쓴다.
 */

import type { BoneId, CoreZone, DinoRunGrade, PlayerId, RevivalForm, RoomState, TeamId } from "@trex/shared";

export function applyExcavationProgress(
  state: RoomState,
  data: {
    teamId: TeamId;
    points: number;
    nextBoneAt: number;
    playerId: PlayerId;
    playerInputs: number;
  },
): RoomState {
  const team = state.teams[data.teamId];
  return {
    ...state,
    teams: {
      ...state.teams,
      [data.teamId]: {
        ...team,
        excavation: {
          ...team.excavation,
          points: data.points,
          nextBoneAt: data.nextBoneAt,
        },
      },
    },
    players: state.players.map((p) =>
      p.id === data.playerId ? { ...p, stats: { ...p.stats, excavationInputs: data.playerInputs } } : p,
    ),
  };
}

export function applyBoneFound(state: RoomState, data: { teamId: TeamId; boneId: BoneId }): RoomState {
  const team = state.teams[data.teamId];
  if (team.excavation.discoveredBoneIds.includes(data.boneId)) return state;
  return {
    ...state,
    teams: {
      ...state.teams,
      [data.teamId]: {
        ...team,
        excavation: {
          ...team.excavation,
          discoveredBoneIds: [...team.excavation.discoveredBoneIds, data.boneId],
        },
      },
    },
  };
}

export function applyExcavationEvent(state: RoomState, data: { teamId: TeamId; kind: "FOSSIL" | "GOLD_BONE" }): RoomState {
  if (data.kind !== "FOSSIL") return state;
  const team = state.teams[data.teamId];
  return {
    ...state,
    teams: {
      ...state.teams,
      [data.teamId]: { ...team, excavation: { ...team.excavation, fossils: team.excavation.fossils + 1 } },
    },
  };
}

export function applyTeamPhaseChanged(
  state: RoomState,
  data: { teamId: TeamId; to: RoomState["teams"][TeamId]["phase"]; endsAt: number | null },
): RoomState {
  const team = state.teams[data.teamId];
  return {
    ...state,
    teams: {
      ...state.teams,
      [data.teamId]: { ...team, phase: data.to, phaseStartedAt: Date.now(), phaseEndsAt: data.endsAt },
    },
  };
}

export function applyDinoStarted(
  state: RoomState,
  data: { teamId: TeamId; obstacleOffsetsMs: number[]; startedAt: number; endsAt: number },
): RoomState {
  const team = state.teams[data.teamId];
  return {
    ...state,
    teams: {
      ...state.teams,
      [data.teamId]: {
        ...team,
        phase: "ASSEMBLY" as const,
        phaseStartedAt: data.startedAt,
        phaseEndsAt: data.endsAt,
        dinoRun: { ...team.dinoRun, obstacleOffsetsMs: data.obstacleOffsetsMs },
      },
    },
  };
}

export function applyDinoProgress(
  state: RoomState,
  data: { teamId: TeamId; playerId: PlayerId; obstacleIndex: number; clearedCount: number },
): RoomState {
  const team = state.teams[data.teamId];
  const prev = team.dinoRun.clearedByPlayer[data.playerId] ?? [];
  if (prev.includes(data.obstacleIndex)) return state;
  return {
    ...state,
    teams: {
      ...state.teams,
      [data.teamId]: {
        ...team,
        dinoRun: {
          ...team.dinoRun,
          clearedByPlayer: { ...team.dinoRun.clearedByPlayer, [data.playerId]: [...prev, data.obstacleIndex] },
        },
      },
    },
  };
}

export function applyPlayerDied(state: RoomState, data: { teamId: TeamId; playerId: PlayerId }): RoomState {
  const team = state.teams[data.teamId];
  if (team.dinoRun.deadPlayerIds.includes(data.playerId)) return state;
  return {
    ...state,
    teams: {
      ...state.teams,
      [data.teamId]: {
        ...team,
        dinoRun: { ...team.dinoRun, deadPlayerIds: [...team.dinoRun.deadPlayerIds, data.playerId] },
      },
    },
  };
}

export function applyDinoFinished(
  state: RoomState,
  data: { teamId: TeamId; performance: number; grade: DinoRunGrade; startStability: number },
): RoomState {
  const team = state.teams[data.teamId];
  return {
    ...state,
    teams: {
      ...state.teams,
      [data.teamId]: {
        ...team,
        dinoRun: { ...team.dinoRun, performance: data.performance, grade: data.grade },
        charging: { ...team.charging, stability: data.startStability },
      },
    },
  };
}

export function applyShotResolved(state: RoomState, data: { teamId: TeamId; energyAfter: number; stabilityAfter: number }): RoomState {
  const team = state.teams[data.teamId];
  return {
    ...state,
    teams: {
      ...state.teams,
      [data.teamId]: { ...team, charging: { ...team.charging, energy: data.energyAfter, stability: data.stabilityAfter } },
    },
  };
}

export function applyCoreChanged(state: RoomState, data: { teamId: TeamId; to: CoreZone; nextChangeAt: number }): RoomState {
  const team = state.teams[data.teamId];
  return {
    ...state,
    teams: {
      ...state.teams,
      [data.teamId]: { ...team, charging: { ...team.charging, activeCore: data.to, coreChangesAt: data.nextChangeAt } },
    },
  };
}

export function applyRevivalFormChanged(
  state: RoomState,
  data: { teamId: TeamId; form: RevivalForm; energy: number; stability: number },
): RoomState {
  const team = state.teams[data.teamId];
  return {
    ...state,
    teams: {
      ...state.teams,
      [data.teamId]: { ...team, charging: { ...team.charging, form: data.form, energy: data.energy, stability: data.stability } },
    },
  };
}

export function applyGameResult(
  state: RoomState,
  data: { winnerTeamId: TeamId | null; reason: RoomState["winner"]["reason"] },
): RoomState {
  return { ...state, roomPhase: "RESULT", winner: { teamId: data.winnerTeamId, reason: data.reason } };
}
