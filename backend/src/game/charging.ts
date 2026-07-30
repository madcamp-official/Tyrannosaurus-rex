/** Plan.md §6.3, §12.4~§12.5. 서버 권위 티라노 이동, 코어 로테이션, 단순 히트박스 판정. */

import {
  CORE_HIT_RADIUS,
  BONE_HIT_RADIUS,
  CHARGING_STAGE_DURATION_MS,
  ENERGY_HIT_CHASE,
  ENERGY_HIT_CORE,
  ENERGY_HIT_FINAL_CORE,
  STABILITY_HIT_CORE,
  TREX_MOVE_AMPLITUDE,
  TREX_MOVE_PERIOD_MS,
  type CoreZone,
  type ChargingStage,
  type Facing,
  type HitZone,
  type NormalizedPoint,
  type PoseId,
} from "@trex/shared";
import type { RoomRecord } from "../rooms/RoomManager.js";
import { seededRandom01 } from "./seededRandom.js";

export const CORE_OFFSETS: Record<CoreZone, NormalizedPoint> = {
  HEART: { x: 0, y: 0 },
  SKULL: { x: -0.1, y: -0.04 },
  SPINE: { x: 0.09, y: 0.02 },
};

export type TrexTransform = {
  position: NormalizedPoint;
  rotationDeg: number;
  facing: Facing;
  poseId: PoseId;
};

const TREX_Y_CENTER = 0.62;
// 좌우로만 흔들리는 느낌을 없애려고 세로 폭도 가로(TREX_MOVE_AMPLITUDE)에 준하게 키웠다.

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** §6.3 "양 팀은 동일한 이동 패턴 시드를 사용한다" — roundSeed로 정한 waypoint 사이를 오간다. */
function trexWaypoint(seed: string, index: number): NormalizedPoint {
  const rx = seededRandom01(`${seed}:trexPath`, index * 2);
  return {
    x: 0.5 + (rx * 2 - 1) * TREX_MOVE_AMPLITUDE,
    y: TREX_Y_CENTER,
  };
}

/**
 * Plan.md §2.3 "모니터엔 스켈레톤 티라노가 단 하나만 표시되며, 두 팀이 같은 개체를 동시에
 * 조준·사격한다." 방에 스켈레톤이 하나뿐이라 팀별 위상 오프셋 없이 방 공유 시작 시각
 * (room.sharedTrexStartedAt)과 roundSeed만으로 움직임을 계산한다 — 랜덤이지만 두 팀에
 * 항상 같은 값이 나오는 결정론적 랜덤워크(waypoint 보간)다.
 */
export function computeTrexTransform(room: RoomRecord, now: number): TrexTransform {
  const startedAt = room.sharedTrexStartedAt ?? now;
  const elapsed = Math.max(0, now - startedAt);
  const seed = room.roundSeed ?? room.state.roomCode;

  if (elapsed >= CHARGING_STAGE_DURATION_MS * 2) {
    const finalElapsed = elapsed - CHARGING_STAGE_DURATION_MS * 2;
    const subtleDepth = Math.sin((finalElapsed / 3_800) * Math.PI * 2);
    return {
      position: { x: 0.5, y: 0.72 + subtleDepth * 0.018 },
      rotationDeg: 0,
      facing: "RIGHT",
      poseId: "ROAR",
    };
  }

  if (elapsed >= CHARGING_STAGE_DURATION_MS) {
    const chaseElapsed = elapsed - CHARGING_STAGE_DURATION_MS;
    const chaseStepMs = 650;
    const chaseIndex = Math.floor(chaseElapsed / chaseStepMs);
    const chaseT = smoothstep((chaseElapsed % chaseStepMs) / chaseStepMs);
    const chasePoint = (index: number): NormalizedPoint => {
      // 도로의 소실점(y≈0.49)에서는 중앙에 모이고, 카메라에 가까워질수록 도로 폭을
      // 따라 좌우 이동 범위가 넓어진다. y가 곧 거리감/모델 크기의 기준이 된다.
      const depth = seededRandom01(`${seed}:chaseDepth`, index);
      const y = 0.5 + depth * 0.29;
      const roadHalfWidth = 0.035 + depth * 0.39;
      const lateral = seededRandom01(`${seed}:chaseX`, index) * 2 - 1;
      return { x: 0.5 + lateral * roadHalfWidth, y };
    };
    const chaseFrom = chasePoint(chaseIndex);
    const chaseTo = chasePoint(chaseIndex + 1);
    return {
      position: {
        x: chaseFrom.x + (chaseTo.x - chaseFrom.x) * chaseT,
        y: chaseFrom.y + (chaseTo.y - chaseFrom.y) * chaseT,
      },
      rotationDeg: 0,
      facing: chaseTo.x >= chaseFrom.x ? "RIGHT" : "LEFT",
      poseId: "WALK",
    };
  }

  const index = Math.floor(elapsed / TREX_MOVE_PERIOD_MS);
  const t = smoothstep((elapsed % TREX_MOVE_PERIOD_MS) / TREX_MOVE_PERIOD_MS);
  const from = trexWaypoint(seed, index);
  const to = trexWaypoint(seed, index + 1);

  return {
    position: { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t },
    rotationDeg: 0,
    facing: to.x >= from.x ? "RIGHT" : "LEFT",
    poseId: "WALK",
  };
}

/** 현재 약점은 서버가 방 단위로 하나만 관리하며 유효 명중 때만 변경된다. */
export function computeActiveCore(room: RoomRecord, _now: number): { core: CoreZone; nextChangeAt: number } {
  return { core: room.sharedActiveCore, nextChangeAt: 0 };
}

/** 현재 부위를 제외한 두 후보 중 라운드 시드와 명중 순번으로 다음 약점을 결정한다. */
export function advanceActiveCore(room: RoomRecord): { from: CoreZone; to: CoreZone } {
  const from = room.sharedActiveCore;
  const candidates = (["HEART", "SKULL", "SPINE"] as const).filter((core) => core !== from);
  const seed = room.roundSeed ?? room.state.roomCode;
  const pick = seededRandom01(`${seed}:coreTarget`, room.sharedCoreHitCount) < 0.5 ? 0 : 1;
  const to = candidates[pick]!;
  room.sharedCoreHitCount += 1;
  room.sharedActiveCore = to;
  return { from, to };
}

export type HitResolution = { hitZone: HitZone | null; energyDelta: number; stabilityDelta: number };

export function computeChargingStage(room: RoomRecord, teamId: "A" | "B", now: number): ChargingStage {
  const startedAt = room.chargingStartedAt[teamId] ?? room.state.teams[teamId].phaseStartedAt;
  const elapsed = Math.max(0, now - startedAt);
  if (elapsed >= CHARGING_STAGE_DURATION_MS * 2) return 3;
  if (elapsed >= CHARGING_STAGE_DURATION_MS) return 2;
  return 1;
}

export function resolveStageHit(
  aimPoint: NormalizedPoint,
  trexCenter: NormalizedPoint,
  activeCore: CoreZone,
  stage: ChargingStage,
): HitResolution {
  if (stage === 2) {
    const distance = Math.hypot(aimPoint.x - trexCenter.x, aimPoint.y - trexCenter.y);
    return distance <= BONE_HIT_RADIUS
      ? { hitZone: "BONE", energyDelta: ENERGY_HIT_CHASE, stabilityDelta: 0 }
      : { hitZone: null, energyDelta: 0, stabilityDelta: 0 };
  }

  const result = resolveHit(aimPoint, trexCenter, activeCore);
  return stage === 3 && result.hitZone !== null
    ? { ...result, energyDelta: ENERGY_HIT_FINAL_CORE }
    : result;
}

/** 화면에 표시된 현재 약점만 유효 명중이다. 몸체나 이전 약점은 점수를 주지 않는다. */
export function resolveHit(aimPoint: NormalizedPoint, trexCenter: NormalizedPoint, activeCore: CoreZone): HitResolution {
  const coreCenter = { x: trexCenter.x + CORE_OFFSETS[activeCore].x, y: trexCenter.y + CORE_OFFSETS[activeCore].y };
  const distToCore = Math.hypot(aimPoint.x - coreCenter.x, aimPoint.y - coreCenter.y);
  if (distToCore <= CORE_HIT_RADIUS) {
    return { hitZone: activeCore, energyDelta: ENERGY_HIT_CORE, stabilityDelta: STABILITY_HIT_CORE };
  }

  return { hitZone: null, energyDelta: 0, stabilityDelta: 0 };
}
