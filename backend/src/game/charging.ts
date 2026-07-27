/** Plan.md §6.3, §12.4~§12.5. 서버 권위 티라노 이동, 코어 로테이션, 단순 히트박스 판정. */

import {
  BONE_HIT_RADIUS,
  CORE_HIT_RADIUS,
  CORE_ROTATION_INTERVAL_MS,
  ENERGY_HIT_BONE,
  ENERGY_HIT_CORE,
  ENERGY_HIT_JOINT_OUTSIDE,
  JOINT_HIT_RADIUS,
  STABILITY_HIT_CORE,
  STABILITY_HIT_JOINT_OUTSIDE,
  TREX_MOVE_AMPLITUDE,
  TREX_MOVE_PERIOD_MS,
  type CoreZone,
  type Facing,
  type HitZone,
  type NormalizedPoint,
  type PoseId,
} from "@trex/shared";
import type { RoomRecord } from "../rooms/RoomManager.js";

const CORE_ORDER: readonly CoreZone[] = ["HEART", "SKULL", "SPINE"];
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

/**
 * Plan.md §2.3 "모니터엔 스켈레톤 티라노가 단 하나만 표시되며, 두 팀이 같은 개체를 동시에
 * 조준·사격한다." 방에 스켈레톤이 하나뿐이라 팀별 위상 오프셋 없이 방 공유 시작 시각
 * (room.sharedTrexStartedAt) 하나로만 움직임을 계산한다.
 */
export function computeTrexTransform(room: RoomRecord, now: number): TrexTransform {
  const startedAt = room.sharedTrexStartedAt ?? now;
  const elapsed = now - startedAt;
  const angle = (elapsed / TREX_MOVE_PERIOD_MS) * Math.PI * 2;
  const x = 0.5 + Math.sin(angle) * TREX_MOVE_AMPLITUDE;
  const y = 0.55 + Math.sin(angle * 0.5) * 0.05;
  const movingRight = Math.cos(angle) > 0;

  return {
    position: { x, y },
    rotationDeg: 0,
    facing: movingRight ? "RIGHT" : "LEFT",
    poseId: "WALK",
  };
}

/** 공유 스켈레톤 하나에 대한 코어 로테이션이라 양 팀이 항상 같은 부위를 본다. */
export function computeActiveCore(room: RoomRecord, now: number): { core: CoreZone; nextChangeAt: number } {
  const startedAt = room.sharedTrexStartedAt ?? now;
  const elapsed = Math.max(0, now - startedAt);
  const index = Math.floor(elapsed / CORE_ROTATION_INTERVAL_MS) % CORE_ORDER.length;
  const nextChangeAt = startedAt + (Math.floor(elapsed / CORE_ROTATION_INTERVAL_MS) + 1) * CORE_ROTATION_INTERVAL_MS;
  return { core: CORE_ORDER[index]!, nextChangeAt };
}

export type HitResolution = { hitZone: HitZone | null; energyDelta: number; stabilityDelta: number };

export function resolveHit(aimPoint: NormalizedPoint, trexCenter: NormalizedPoint, activeCore: CoreZone): HitResolution {
  const coreCenter = { x: trexCenter.x + CORE_OFFSETS[activeCore].x, y: trexCenter.y + CORE_OFFSETS[activeCore].y };
  const distToCore = Math.hypot(aimPoint.x - coreCenter.x, aimPoint.y - coreCenter.y);
  if (distToCore <= CORE_HIT_RADIUS) {
    return { hitZone: activeCore, energyDelta: ENERGY_HIT_CORE, stabilityDelta: STABILITY_HIT_CORE };
  }

  const distToBody = Math.hypot(aimPoint.x - trexCenter.x, aimPoint.y - trexCenter.y);
  if (distToBody <= BONE_HIT_RADIUS) {
    return { hitZone: "BONE", energyDelta: ENERGY_HIT_BONE, stabilityDelta: 0 };
  }
  if (distToBody <= JOINT_HIT_RADIUS) {
    return { hitZone: "JOINT_OUTSIDE", energyDelta: ENERGY_HIT_JOINT_OUTSIDE, stabilityDelta: STABILITY_HIT_JOINT_OUTSIDE };
  }
  return { hitZone: null, energyDelta: 0, stabilityDelta: 0 };
}
