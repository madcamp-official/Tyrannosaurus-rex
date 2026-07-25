/** Plan.md §6.3, §17.9. 서버가 보관하는 플레이어별 최신 유효 조준 좌표. */

import type { AimMode, AimUpdateInput, NormalizedPoint, PlayerId } from "@trex/shared";
import type { RoomRecord } from "../rooms/RoomManager.js";

export type AimState = {
  point: NormalizedPoint;
  mode: AimMode;
  calibrated: boolean;
  receivedAt: number;
  lastSeq: number;
};

export function applyAimUpdate(room: RoomRecord, playerId: PlayerId, input: AimUpdateInput, now: number): boolean {
  const existing = room.aimState.get(playerId);
  if (existing && input.seq <= existing.lastSeq) return false;
  room.aimState.set(playerId, {
    point: input.point,
    mode: input.mode,
    calibrated: input.calibrated,
    receivedAt: now,
    lastSeq: input.seq,
  });
  return true;
}
