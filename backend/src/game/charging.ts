/** Plan.md §6.3, §12.4~§12.5. 서버 권위 티라노 이동, 코어 로테이션, 단순 히트박스 판정. */

import {
  BONE_HIT_RADIUS,
  CORE_HIT_RADIUS,
  ENERGY_HIT_BONE,
  ENERGY_HIT_CORE,
  STABILITY_HIT_CORE,
  TREX_MOVE_AMPLITUDE,
  TREX_MOVE_PERIOD_MS,
  type CoreZone,
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

const TREX_Y_CENTER = 0.55;
// 좌우로만 흔들리는 느낌을 없애려고 세로 폭도 가로(TREX_MOVE_AMPLITUDE)에 준하게 키웠다.
const TREX_Y_AMPLITUDE = 0.26;

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** §6.3 "양 팀은 동일한 이동 패턴 시드를 사용한다" — roundSeed로 정한 waypoint 사이를 오간다. */
function trexWaypoint(seed: string, index: number): NormalizedPoint {
  const rx = seededRandom01(`${seed}:trexPath`, index * 2);
  const ry = seededRandom01(`${seed}:trexPath`, index * 2 + 1);
  return {
    x: 0.5 + (rx * 2 - 1) * TREX_MOVE_AMPLITUDE,
    y: TREX_Y_CENTER + (ry * 2 - 1) * TREX_Y_AMPLITUDE,
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

/** 코어는 더 이상 부위를 옮겨 다니지 않고 항상 심장 위치에 고정된다. */
export function computeActiveCore(_room: RoomRecord, _now: number): { core: CoreZone; nextChangeAt: number } {
  return { core: "HEART", nextChangeAt: Number.POSITIVE_INFINITY };
}

export type HitResolution = { hitZone: HitZone | null; energyDelta: number; stabilityDelta: number };

/** 티라노를 맞히면 점수, 코어(심장)를 맞히면 추가 점수, 완전히 빗나가면 0점 — 3단계 판정을 없앴다. */
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
  return { hitZone: null, energyDelta: 0, stabilityDelta: 0 };
}
