/**
 * Plan.md §6.2 골격 퍼즐 정답 좌표. 실제 실루엣 아트가 없어 MVP 기본 레이아웃으로 정했다
 * (0~1 정규화 캔버스, 대략적인 티라노 옆모습 배치). 아트가 정해지면 이 표만 바꾸면 된다.
 */

import type { BoneId, Transform2D } from "./domain.js";

export const PUZZLE_TARGET_TRANSFORMS: Record<BoneId, Transform2D> = {
  HEAD: { x: 0.15, y: 0.28, rotationDeg: 0 },
  NECK: { x: 0.27, y: 0.38, rotationDeg: -25 },
  TORSO: { x: 0.48, y: 0.45, rotationDeg: 0 },
  PELVIS: { x: 0.63, y: 0.48, rotationDeg: 0 },
  ARM_LEFT: { x: 0.36, y: 0.58, rotationDeg: 35 },
  ARM_RIGHT: { x: 0.4, y: 0.62, rotationDeg: -35 },
  LEG_LEFT: { x: 0.58, y: 0.78, rotationDeg: 8 },
  LEG_RIGHT: { x: 0.68, y: 0.8, rotationDeg: -8 },
  TAIL: { x: 0.88, y: 0.52, rotationDeg: 15 },
};
