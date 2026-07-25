import { describe, expect, it } from "vitest";
import {
  BONE_IDS,
  PUZZLE_CLAIM_TTL_MS,
  PUZZLE_MAX_CONCURRENT_CLAIMS_PER_TEAM,
  PUZZLE_PIECE_COUNT,
  PUZZLE_TARGET_TRANSFORMS,
  PUZZLE_WRONG_PLACEMENT_LOCK_MS,
} from "@trex/shared";
import { RoomManager } from "../src/rooms/RoomManager.js";

function setupAssemblyRoom() {
  const rooms = new RoomManager("https://trex.example.com");
  const created = rooms.createRoom("host-1")!;
  const roomCode = created.room.state.roomCode;
  const a = rooms.joinRoom(roomCode, "A1", "socket-a1");
  const a2 = rooms.joinRoom(roomCode, "A2", "socket-a2");
  const b = rooms.joinRoom(roomCode, "B1", "socket-b1");
  if (!a.ok || !a2.ok || !b.ok) throw new Error("join failed");
  for (const p of [a, a2, b]) rooms.setReady(roomCode, p.playerId, true);
  rooms.startGame(created.room);

  const room = created.room;
  room.state.teams.A.phase = "ASSEMBLY";
  for (const piece of room.state.teams.A.puzzle.pieces) piece.discovered = true;

  return { rooms, room, playerA1: a.playerId, playerA2: a2.playerId };
}

describe("puzzle claim/move/place", () => {
  it("rejects a second claim on an already-claimed piece", () => {
    const { rooms, room, playerA1, playerA2 } = setupAssemblyRoom();
    const now = Date.now();
    const first = rooms.applyPuzzleClaim(room, "A", playerA1, "HEAD", now);
    expect(first.ok).toBe(true);
    const second = rooms.applyPuzzleClaim(room, "A", playerA2, "HEAD", now);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe("PIECE_ALREADY_CLAIMED");
  });

  it("releases a claim once its TTL has expired", () => {
    const { rooms, room, playerA1, playerA2 } = setupAssemblyRoom();
    const now = Date.now();
    rooms.applyPuzzleClaim(room, "A", playerA1, "HEAD", now);
    const later = now + PUZZLE_CLAIM_TTL_MS + 10;
    const retry = rooms.applyPuzzleClaim(room, "A", playerA2, "HEAD", later);
    expect(retry.ok).toBe(true);
  });

  it("caps concurrent claims per team", () => {
    const { rooms, room, playerA1 } = setupAssemblyRoom();
    const now = Date.now();
    const boneIds = BONE_IDS.slice(0, PUZZLE_MAX_CONCURRENT_CLAIMS_PER_TEAM + 1);
    const results = boneIds.map((boneId) => rooms.applyPuzzleClaim(room, "A", playerA1, boneId, now));
    const okCount = results.filter((r) => r.ok).length;
    expect(okCount).toBe(PUZZLE_MAX_CONCURRENT_CLAIMS_PER_TEAM);
    expect(results[results.length - 1]!.ok).toBe(false);
  });

  it("fixes a piece placed within tolerance of its target transform", () => {
    const { rooms, room, playerA1 } = setupAssemblyRoom();
    const now = Date.now();
    const claim = rooms.applyPuzzleClaim(room, "A", playerA1, "HEAD", now);
    if (!claim.ok) throw new Error("claim failed");

    const target = PUZZLE_TARGET_TRANSFORMS.HEAD;
    const result = rooms.applyPuzzlePlace(room, "A", playerA1, "HEAD", claim.claimToken, target, now + 100);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.correct).toBe(true);
    expect(room.state.teams.A.puzzle.fixedCount).toBe(1);
    const piece = room.state.teams.A.puzzle.pieces.find((p) => p.boneId === "HEAD")!;
    expect(piece.fixed).toBe(true);
    expect(piece.transform).toEqual(target);
  });

  it("locks a piece for PUZZLE_WRONG_PLACEMENT_LOCK_MS on an incorrect placement", () => {
    const { rooms, room, playerA1, playerA2 } = setupAssemblyRoom();
    const now = Date.now();
    const claim = rooms.applyPuzzleClaim(room, "A", playerA1, "HEAD", now);
    if (!claim.ok) throw new Error("claim failed");

    const wrong = { x: 0.01, y: 0.01, rotationDeg: 0 };
    const result = rooms.applyPuzzlePlace(room, "A", playerA1, "HEAD", claim.claimToken, wrong, now + 100);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.correct).toBe(false);
      expect(result.lockedUntil).toBeGreaterThan(now);
    }

    const reclaim = rooms.applyPuzzleClaim(room, "A", playerA2, "HEAD", now + 200);
    expect(reclaim.ok).toBe(false);

    const afterLock = rooms.applyPuzzleClaim(room, "A", playerA2, "HEAD", now + PUZZLE_WRONG_PLACEMENT_LOCK_MS + 250);
    expect(afterLock.ok).toBe(true);
  });

  it("transitions the team to CHARGING once all pieces are fixed", () => {
    const { rooms, room, playerA1 } = setupAssemblyRoom();
    let now = Date.now();
    expect(BONE_IDS).toHaveLength(PUZZLE_PIECE_COUNT);

    for (const boneId of BONE_IDS) {
      now += 200;
      const claim = rooms.applyPuzzleClaim(room, "A", playerA1, boneId, now);
      if (!claim.ok) throw new Error(`claim failed for ${boneId}`);
      now += 200;
      rooms.applyPuzzlePlace(room, "A", playerA1, boneId, claim.claimToken, PUZZLE_TARGET_TRANSFORMS[boneId], now);
    }

    expect(room.state.teams.A.puzzle.fixedCount).toBe(PUZZLE_PIECE_COUNT);
    expect(room.state.teams.A.phase).toBe("CHARGING");
    expect(room.state.teams.A.phaseEndsAt).not.toBeNull();
    expect(room.phaseDurations.A.assemblyMs).not.toBeNull();
  });

  it("clamps a move that requests an impossibly large jump in a tiny time window", () => {
    const { rooms, room, playerA1 } = setupAssemblyRoom();
    const now = Date.now();
    const claim = rooms.applyPuzzleClaim(room, "A", playerA1, "HEAD", now);
    if (!claim.ok) throw new Error("claim failed");

    const jump = { x: 1, y: 1, rotationDeg: 180 };
    const result = rooms.applyPuzzleMove(room, "A", playerA1, "HEAD", claim.claimToken, jump, now + 5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const dist = Math.hypot(result.transform.x - 0.5, result.transform.y - 0.5);
      expect(dist).toBeLessThan(0.1);
    }
  });
});
