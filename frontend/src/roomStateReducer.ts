/**
 * Plan.md §0.3 "고빈도 입력과 저빈도 전체 상태를 별도 이벤트로 나눈다".
 * room:state는 구조 변화(팀 배정, phase 전환)에만 오고, 발굴·다이노런처럼 잦은 갱신은
 * 전용 이벤트로 온다. 데스크탑·모바일 모두 이 이벤트들을 로컬 RoomState에 합성해서 쓴다.
 */

import type { BoneId, CoreZone, DinoRunGrade, PlayerId, RevivalForm, RoomState, SkyObject, TeamId } from "@trex/shared";

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

export function applyExcavationTeamFinished(
  state: RoomState,
  data: { teamId: TeamId; result: "WIN" | "LOSE" | "DRAW"; score: number },
): RoomState {
  const team = state.teams[data.teamId];
  return {
    ...state,
    teams: {
      ...state.teams,
      [data.teamId]: {
        ...team,
        excavation: { ...team.excavation, result: data.result },
        scores: { ...team.scores, excavation: data.score },
      },
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
  data: { teamId: TeamId; skyObjects: SkyObject[]; startedAt: number; endsAt: number },
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
        // 이 이벤트 자체가 "운석 피하기 시작"이니, 이전 라운드나 이전 room:state에 남아있을
        // 수 있는 목숨·점수를 여기서 직접 0/풀로 되돌린다 — 최신 room:state 스냅샷이 이미
        // 반영해뒀을 거라고 기대하고 team.dinoRun을 그대로 스프레드하면, 타이밍이 어긋났을 때
        // 이전 값(다 깎인 목숨, 마이너스 점수 등)이 새 라운드로 새어 들어갈 수 있었다.
        dinoRun: {
          skyObjects: data.skyObjects,
          livesByPlayer: {},
          scoreByPlayer: {},
          resolvedObjectIdsByPlayer: {},
          deadPlayerIds: [],
          performance: null,
          grade: null,
          result: null,
        },
      },
    },
  };
}

export function applyDinoHit(
  state: RoomState,
  data: { teamId: TeamId; playerId: PlayerId; livesLeft: number; score: number },
): RoomState {
  const team = state.teams[data.teamId];
  return {
    ...state,
    teams: {
      ...state.teams,
      [data.teamId]: {
        ...team,
        dinoRun: {
          ...team.dinoRun,
          livesByPlayer: { ...team.dinoRun.livesByPlayer, [data.playerId]: data.livesLeft },
          scoreByPlayer: { ...team.dinoRun.scoreByPlayer, [data.playerId]: data.score },
        },
      },
    },
  };
}

export function applyDinoBonus(
  state: RoomState,
  data: { teamId: TeamId; playerId: PlayerId; livesLeft: number; score: number },
): RoomState {
  const team = state.teams[data.teamId];
  return {
    ...state,
    teams: {
      ...state.teams,
      [data.teamId]: {
        ...team,
        dinoRun: {
          ...team.dinoRun,
          livesByPlayer: { ...team.dinoRun.livesByPlayer, [data.playerId]: data.livesLeft },
          scoreByPlayer: { ...team.dinoRun.scoreByPlayer, [data.playerId]: data.score },
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

export function applyDinoTeamResult(
  state: RoomState,
  data: { teamId: TeamId; result: "WIN" | "LOSE" | "DRAW"; score: number },
): RoomState {
  const team = state.teams[data.teamId];
  return {
    ...state,
    teams: {
      ...state.teams,
      [data.teamId]: {
        ...team,
        dinoRun: { ...team.dinoRun, result: data.result },
        scores: { ...team.scores, dinoRun: data.score },
      },
    },
  };
}

export function applyShotResolved(
  state: RoomState,
  data: {
    teamId: TeamId;
    playerId: PlayerId;
    energyAfter: number;
    stabilityAfter: number;
    hit: boolean;
    hitZone: "HEART" | "SKULL" | "SPINE" | "BONE" | null;
    energyDelta: number;
  },
): RoomState {
  const team = state.teams[data.teamId];
  const isCoreHit = data.hitZone === "HEART" || data.hitZone === "SKULL" || data.hitZone === "SPINE";
  return {
    ...state,
    teams: {
      ...state.teams,
      [data.teamId]: { ...team, charging: { ...team.charging, energy: data.energyAfter, stability: data.stabilityAfter } },
    },
    // room:state는 CHARGING 중엔 다시 브로드캐스트되지 않으므로, 스코어보드의 발사/명중 수는
    // 이 이벤트에서 직접 누적해야 한다 — 안 하면 라운드가 끝날 때까지 0에 머문다.
    players: state.players.map((p) =>
      p.id === data.playerId
        ? {
            ...p,
            stats: {
              ...p.stats,
              shots: p.stats.shots + 1,
              hits: p.stats.hits + (data.hit ? 1 : 0),
              coreHits: p.stats.coreHits + (isCoreHit ? 1 : 0),
              energyContributed: p.stats.energyContributed + data.energyDelta,
            },
          }
        : p,
    ),
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
