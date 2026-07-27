/** 배틀 무대 고정 해상도 및 좌표 상수. 1920x1080 기준, 다른 비율은 레터박스 스케일링. */

import type { TeamId } from "./battleTypes";

export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** 총구 위치 — 정규화(0..1) 좌표 */
export const GUN_MUZZLE: Record<TeamId, [number, number]> = {
  A: [0.085, 0.9],
  B: [0.915, 0.9],
};
