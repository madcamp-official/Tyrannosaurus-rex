/** Plan.md §6.2, §17.6~17.8. 골격 퍼즐 조작권·이동·배치 판정. */

import { randomUUID } from "node:crypto";
import {
  PUZZLE_CLAIM_TTL_MS,
  PUZZLE_MAX_CONCURRENT_CLAIMS_PER_TEAM,
  PUZZLE_MAX_POSITION_SPEED_PER_SECOND,
  PUZZLE_MAX_ROTATION_SPEED_PER_SECOND,
  PUZZLE_PIECE_COUNT,
  PUZZLE_POSITION_TOLERANCE_RATIO,
  PUZZLE_ROTATION_TOLERANCE_DEG,
  PUZZLE_TARGET_TRANSFORMS,
  PUZZLE_WRONG_PLACEMENT_LOCK_MS,
  type BoneId,
  type PlayerId,
  type PuzzlePieceState,
  type TeamId,
  type TeamPhase,
  type Transform2D,
} from "@trex/shared";
import type { RoomRecord } from "../rooms/RoomManager.js";

export type PuzzleClaimError = "BONE_NOT_AVAILABLE" | "PIECE_ALREADY_CLAIMED" | "RATE_LIMITED" | "WRONG_TEAM_PHASE";
export type PuzzleClaimSuccess = { ok: true; boneId: BoneId; claimToken: string; expiresAt: number; transform: Transform2D };
export type PuzzleClaimResult = PuzzleClaimSuccess | { ok: false; error: PuzzleClaimError };

export type PuzzlePlaceError = "BONE_NOT_AVAILABLE" | "PIECE_CLAIM_EXPIRED" | "WRONG_TEAM_PHASE";
export type PuzzlePlaceSuccess = {
  ok: true;
  boneId: BoneId;
  correct: boolean;
  fixedTransform?: Transform2D;
  lockedUntil?: number;
  teamPhase: TeamPhase;
  phaseCompleted: boolean;
};
export type PuzzlePlaceResult = PuzzlePlaceSuccess | { ok: false; error: PuzzlePlaceError };

function findPiece(room: RoomRecord, teamId: TeamId, boneId: BoneId): PuzzlePieceState | undefined {
  return room.state.teams[teamId].puzzle.pieces.find((p) => p.boneId === boneId);
}

function isClaimUsable(piece: PuzzlePieceState, now: number): boolean {
  if (piece.claimedBy === null) return false;
  if (piece.claimExpiresAt === null) return false;
  return piece.claimExpiresAt > now;
}

/** claimExpiresAt이 지난 조각의 조작권을 해제한다. 해제된 조각의 boneId 목록을 반환한다 (§17.7 "5초간 입력이 없으면"). */
export function releaseExpiredClaims(room: RoomRecord, teamId: TeamId, now: number): BoneId[] {
  const released: BoneId[] = [];
  for (const piece of room.state.teams[teamId].puzzle.pieces) {
    if (piece.claimedBy !== null && piece.claimExpiresAt !== null && piece.claimExpiresAt <= now) {
      piece.claimedBy = null;
      piece.claimToken = null;
      piece.claimExpiresAt = null;
      released.push(piece.boneId);
    }
  }
  return released;
}

export function claimPiece(room: RoomRecord, teamId: TeamId, playerId: PlayerId, boneId: BoneId, now: number): PuzzleClaimResult {
  if (room.state.teams[teamId].phase !== "ASSEMBLY") return { ok: false, error: "WRONG_TEAM_PHASE" };
  releaseExpiredClaims(room, teamId, now);
  const piece = findPiece(room, teamId, boneId);
  if (!piece || !piece.discovered || piece.fixed) return { ok: false, error: "BONE_NOT_AVAILABLE" };
  if (piece.lockedUntil !== null && piece.lockedUntil > now) return { ok: false, error: "BONE_NOT_AVAILABLE" };
  if (isClaimUsable(piece, now)) return { ok: false, error: "PIECE_ALREADY_CLAIMED" };

  const activeClaims = room.state.teams[teamId].puzzle.pieces.filter((p) => isClaimUsable(p, now)).length;
  if (activeClaims >= PUZZLE_MAX_CONCURRENT_CLAIMS_PER_TEAM) return { ok: false, error: "RATE_LIMITED" };

  const claimToken = randomUUID();
  piece.claimedBy = playerId;
  piece.claimToken = claimToken;
  piece.claimExpiresAt = now + PUZZLE_CLAIM_TTL_MS;
  room.puzzleLastMoveAt[teamId].set(boneId, now);

  return { ok: true, boneId, claimToken, expiresAt: piece.claimExpiresAt, transform: piece.transform };
}

function normalizeAngle(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

function clampMovement(from: Transform2D, to: Transform2D, elapsedSec: number): Transform2D {
  const maxDist = PUZZLE_MAX_POSITION_SPEED_PER_SECOND * Math.max(elapsedSec, 0);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  let x = to.x;
  let y = to.y;
  if (dist > maxDist && dist > 0) {
    const scale = maxDist / dist;
    x = from.x + dx * scale;
    y = from.y + dy * scale;
  }

  const maxRot = PUZZLE_MAX_ROTATION_SPEED_PER_SECOND * Math.max(elapsedSec, 0);
  const rawDelta = normalizeAngle(to.rotationDeg - from.rotationDeg);
  const clampedDelta = Math.max(-maxRot, Math.min(maxRot, rawDelta));
  const rotationDeg = normalizeAngle(from.rotationDeg + clampedDelta);

  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)), rotationDeg };
}

export type PuzzleMoveResult = { ok: true; transform: Transform2D } | { ok: false };

export function movePiece(
  room: RoomRecord,
  teamId: TeamId,
  playerId: PlayerId,
  boneId: BoneId,
  claimToken: string,
  requestedTransform: Transform2D,
  now: number,
): PuzzleMoveResult {
  if (room.state.teams[teamId].phase !== "ASSEMBLY") return { ok: false };
  const piece = findPiece(room, teamId, boneId);
  if (!piece || piece.claimedBy !== playerId || piece.claimToken !== claimToken) return { ok: false };
  if (piece.claimExpiresAt === null || piece.claimExpiresAt <= now) return { ok: false };

  const lastMoveAt = room.puzzleLastMoveAt[teamId].get(boneId) ?? now;
  const elapsedSec = (now - lastMoveAt) / 1000;
  const clamped = clampMovement(piece.transform, requestedTransform, elapsedSec);
  piece.transform = clamped;
  piece.claimExpiresAt = now + PUZZLE_CLAIM_TTL_MS;
  room.puzzleLastMoveAt[teamId].set(boneId, now);

  return { ok: true, transform: clamped };
}

function isWithinTolerance(transform: Transform2D, target: Transform2D): boolean {
  const dist = Math.hypot(transform.x - target.x, transform.y - target.y);
  const rotDiff = Math.abs(normalizeAngle(transform.rotationDeg - target.rotationDeg));
  return dist <= PUZZLE_POSITION_TOLERANCE_RATIO && rotDiff <= PUZZLE_ROTATION_TOLERANCE_DEG;
}

export function placePiece(
  room: RoomRecord,
  teamId: TeamId,
  playerId: PlayerId,
  boneId: BoneId,
  claimToken: string,
  requestedTransform: Transform2D,
  now: number,
): PuzzlePlaceResult {
  if (room.state.teams[teamId].phase !== "ASSEMBLY") return { ok: false, error: "WRONG_TEAM_PHASE" };
  const piece = findPiece(room, teamId, boneId);
  if (!piece) return { ok: false, error: "BONE_NOT_AVAILABLE" };
  if (piece.claimedBy !== playerId || piece.claimToken !== claimToken) return { ok: false, error: "PIECE_CLAIM_EXPIRED" };
  if (piece.claimExpiresAt === null || piece.claimExpiresAt <= now) return { ok: false, error: "PIECE_CLAIM_EXPIRED" };

  const team = room.state.teams[teamId];
  const target = PUZZLE_TARGET_TRANSFORMS[boneId];
  const correct = isWithinTolerance(requestedTransform, target);

  piece.claimedBy = null;
  piece.claimToken = null;
  piece.claimExpiresAt = null;
  room.puzzleLastMoveAt[teamId].delete(boneId);

  const player = room.state.players.find((p) => p.id === playerId);
  if (player) {
    if (correct) player.stats.puzzleCorrect += 1;
    else player.stats.puzzleWrong += 1;
  }

  if (correct) {
    piece.fixed = true;
    piece.transform = target;
    team.puzzle.fixedCount += 1;

    const phaseCompleted = team.puzzle.fixedCount >= PUZZLE_PIECE_COUNT;
    if (phaseCompleted) {
      team.puzzle.completedAt = now;
    }
    return { ok: true, boneId, correct: true, fixedTransform: target, teamPhase: team.phase, phaseCompleted };
  }

  piece.transform = { x: 0.5, y: 0.5, rotationDeg: 0 };
  piece.lockedUntil = now + PUZZLE_WRONG_PLACEMENT_LOCK_MS;
  return { ok: true, boneId, correct: false, lockedUntil: piece.lockedUntil, teamPhase: team.phase, phaseCompleted: false };
}
