/**
 * Plan.md §0.3 "고빈도 입력과 저빈도 전체 상태를 별도 이벤트로 나눈다".
 * room:state는 구조 변화(팀 배정, phase 전환)에만 오고, 발굴처럼 잦은 갱신은
 * 전용 이벤트로 온다. 데스크탑은 이 이벤트들을 로컬 RoomState에 합성해서 그린다.
 */

import type { BoneId, RoomState, TeamId } from "@trex/shared";

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
