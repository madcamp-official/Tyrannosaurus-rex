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
  type TeamId,
} from "@trex/shared";
import type { RoomRecord } from "../rooms/RoomManager.js";
import { seededRandom01 } from "./seededRandom.js";

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

/** 팀마다 위상이 다르지만 같은 방 시드에서 파생되어 "동일한 이동 패턴 시드"를 공유한다 (§6.3). */
export function computeTrexTransform(room: RoomRecord, teamId: TeamId, now: number): TrexTransform {
  const startedAt = room.chargingStartedAt[teamId] ?? now;
  const elapsed = now - startedAt;
  const phaseOffset = seededRandom01(`${room.roundSeed}:trexPhase`, teamId.charCodeAt(0)) * Math.PI * 2;
  const angle = (elapsed / TREX_MOVE_PERIOD_MS) * Math.PI * 2 + phaseOffset;
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

export function computeActiveCore(room: RoomRecord, teamId: TeamId, now: number): { core: CoreZone; nextChangeAt: number } {
  const startedAt = room.chargingStartedAt[teamId] ?? now;
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
