/**
 * Plan.md §0.3 "고빈도 입력과 저빈도 전체 상태를 별도 이벤트로 나눈다".
 * room:state는 구조 변화(팀 배정, phase 전환)에만 오고, 발굴·퍼즐처럼 잦은 갱신은
 * 전용 이벤트로 온다. 데스크탑·모바일 모두 이 이벤트들을 로컬 RoomState에 합성해서 쓴다.
 */

import type { BoneId, CoreZone, PlayerId, RevivalForm, RoomState, TeamId, Transform2D } from "@trex/shared";

export function applyExcavationProgress(
  state: RoomState,
  data: { teamId: TeamId; points: number; nextBoneAt: number; efficiencyMultiplier: number },
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
          efficiencyMultiplier: data.efficiencyMultiplier,
        },
      },
    },
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
        puzzle: {
          ...team.puzzle,
          pieces: team.puzzle.pieces.map((piece) => (piece.boneId === data.boneId ? { ...piece, discovered: true } : piece)),
        },
      },
    },
  };
}

export function applyExcavationEvent(state: RoomState, data: { teamId: TeamId; kind: "STONE" | "FOSSIL" | "GOLD_BONE" }): RoomState {
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

export function applyPuzzleClaimChanged(
  state: RoomState,
  data: { teamId: TeamId; boneId: BoneId; claimedBy: PlayerId | null; expiresAt: number | null },
): RoomState {
  const team = state.teams[data.teamId];
  return {
    ...state,
    teams: {
      ...state.teams,
      [data.teamId]: {
        ...team,
        puzzle: {
          ...team.puzzle,
          pieces: team.puzzle.pieces.map((piece) =>
            piece.boneId === data.boneId ? { ...piece, claimedBy: data.claimedBy, claimExpiresAt: data.expiresAt } : piece,
          ),
        },
      },
    },
  };
}

export function applyPuzzlePieceMoved(
  state: RoomState,
  data: { teamId: TeamId; boneId: BoneId; transform: Transform2D },
): RoomState {
  const team = state.teams[data.teamId];
  return {
    ...state,
    teams: {
      ...state.teams,
      [data.teamId]: {
        ...team,
        puzzle: {
          ...team.puzzle,
          pieces: team.puzzle.pieces.map((piece) => (piece.boneId === data.boneId ? { ...piece, transform: data.transform } : piece)),
        },
      },
    },
  };
}

export function applyPuzzlePiecePlaced(
  state: RoomState,
  data: { teamId: TeamId; boneId: BoneId; correct: boolean; fixedTransform?: Transform2D },
): RoomState {
  const team = state.teams[data.teamId];
  const nextPieces = team.puzzle.pieces.map((piece) => {
    if (piece.boneId !== data.boneId) return piece;
    if (data.correct) {
      return { ...piece, fixed: true, transform: data.fixedTransform ?? piece.transform, claimedBy: null, claimToken: null, claimExpiresAt: null };
    }
    return { ...piece, claimedBy: null, claimToken: null, claimExpiresAt: null };
  });
  return {
    ...state,
    teams: {
      ...state.teams,
      [data.teamId]: {
        ...team,
        puzzle: { ...team.puzzle, pieces: nextPieces, fixedCount: data.correct ? team.puzzle.fixedCount + 1 : team.puzzle.fixedCount },
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
