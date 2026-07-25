/**
 * Plan.md §6.2 골격 퍼즐 정답 좌표. 실제 실루엣 아트가 없어 MVP 기본 레이아웃으로 정했다
 * (0~1 정규화 캔버스, 대략적인 티라노 옆모습 배치). 아트가 정해지면 이 표만 바꾸면 된다.
 */

import type { BoneId, Transform2D } from "./domain.js";

export const PUZZLE_TARGET_TRANSFORMS: Record<BoneId, Transform2D> = {
  SKULL: { x: 0.12, y: 0.27, rotationDeg: 0 },
  JAW: { x: 0.14, y: 0.36, rotationDeg: 0 },
  NECK: { x: 0.25, y: 0.36, rotationDeg: -20 },
  SPINE: { x: 0.44, y: 0.39, rotationDeg: 0 },
  RIBCAGE: { x: 0.43, y: 0.5, rotationDeg: 0 },
  PELVIS: { x: 0.61, y: 0.47, rotationDeg: 0 },
  ARM_LEFT: { x: 0.33, y: 0.57, rotationDeg: 32 },
  ARM_RIGHT: { x: 0.38, y: 0.61, rotationDeg: -32 },
  LEG_LEFT: { x: 0.56, y: 0.78, rotationDeg: 8 },
  LEG_RIGHT: { x: 0.66, y: 0.8, rotationDeg: -8 },
  TAIL_BASE: { x: 0.72, y: 0.48, rotationDeg: 8 },
  TAIL_MIDDLE: { x: 0.83, y: 0.45, rotationDeg: 12 },
  TAIL_TIP: { x: 0.94, y: 0.41, rotationDeg: 16 },
};
