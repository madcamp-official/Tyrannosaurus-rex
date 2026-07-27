import { describe, expect, it } from "vitest";
import { BONE_IDS, CORE_BONE_COUNT, EXCAVATION_MAX_INPUTS_PER_SECOND, EXCAVATION_POINTS_PER_BONE } from "@trex/shared";
import { RoomManager } from "../src/rooms/RoomManager.js";
import { makeBoneOrder } from "../src/game/excavation.js";

function setupStartedRoom() {
  const rooms = new RoomManager("https://trex.example.com");
  const created = rooms.createRoom("host-1", "테스트 방", 5)!;
  const roomCode = created.room.state.roomCode;
  const a = rooms.joinRoom(roomCode, "A1", "socket-a1");
  const b = rooms.joinRoom(roomCode, "B1", "socket-b1");
  if (!a.ok || !b.ok) throw new Error("join failed");
  rooms.setReady(roomCode, a.playerId, true);
  rooms.setReady(roomCode, b.playerId, true);
  rooms.startGame(created.room);
  return { rooms, room: created.room, playerA: a.playerId };
}

describe("makeBoneOrder", () => {
  it("is deterministic for a given seed and contains every puzzle bone exactly once", () => {
    const orderA = makeBoneOrder("seed-1");
    const orderB = makeBoneOrder("seed-1");
    expect(orderA).toEqual(orderB);
    expect(new Set(orderA).size).toBe(BONE_IDS.length);
  });

  it("differs across seeds (not guaranteed but true for these fixtures)", () => {
    expect(makeBoneOrder("seed-1")).not.toEqual(makeBoneOrder("seed-2"));
  });
});

describe("applyExcavation via RoomManager", () => {
  it("accumulates points and ignores out-of-order seq", () => {
    const { rooms, room, playerA } = setupStartedRoom();
    const now = Date.now();

    const first = rooms.applyExcavation(
      room,
      "A",
      playerA,
      { seq: 1, count: 3, sourceCounts: { motion: 3, tap: 0 }, clientTime: now },
      now,
    );
    expect(first.accepted).toBe(true);
    expect(first.pointsAdded).toBeCloseTo(3);

    const stale = rooms.applyExcavation(
      room,
      "A",
      playerA,
      { seq: 1, count: 5, sourceCounts: { motion: 5, tap: 0 }, clientTime: now },
      now,
    );
    expect(stale.accepted).toBe(false);
    expect(room.state.teams.A.excavation.points).toBeCloseTo(3);
  });

  it("rejects mismatched count/sourceCounts without mutating state", () => {
    const { rooms, room, playerA } = setupStartedRoom();
    const now = Date.now();
    const result = rooms.applyExcavation(
      room,
      "A",
      playerA,
      { seq: 1, count: 5, sourceCounts: { motion: 1, tap: 1 }, clientTime: now },
      now,
    );
    expect(result.accepted).toBe(false);
    expect(room.state.teams.A.excavation.points).toBe(0);
  });

  it("caps a single player at EXCAVATION_MAX_INPUTS_PER_SECOND within one window", () => {
    const { rooms, room, playerA } = setupStartedRoom();
    const now = Date.now();
    let seq = 1;
    let total = 0;
    for (let i = 0; i < 10; i += 1) {
      const result = rooms.applyExcavation(
        room,
        "A",
        playerA,
        { seq: seq++, count: 5, sourceCounts: { motion: 5, tap: 0 }, clientTime: now },
        now,
      );
      total += result.pointsAdded;
    }
    expect(total).toBeLessThanOrEqual(EXCAVATION_MAX_INPUTS_PER_SECOND + 0.001);
  });

  it("awards bones in the room's seeded order and transitions the team to ASSEMBLY", () => {
    const { rooms, room, playerA } = setupStartedRoom();
    const expectedOrder = room.boneOrder;
    expect(expectedOrder).toHaveLength(BONE_IDS.length);

    let seq = 1;
    let now = Date.now();
    const awarded: string[] = [];
    // Spread input across many separate 1s windows so the per-player/team rate caps never bind,
    // isolating the bone-award and phase-transition behavior under test.
    for (let i = 0; i < 200 && room.state.teams.A.phase === "EXCAVATION"; i += 1) {
      now += 1000;
      const result = rooms.applyExcavation(
        room,
        "A",
        playerA,
        { seq: seq++, count: 5, sourceCounts: { motion: 5, tap: 0 }, clientTime: now },
        now,
      );
      awarded.push(...result.boneAwards);
    }

    const expectedAwarded = expectedOrder.slice(0, CORE_BONE_COUNT);
    expect(awarded).toEqual(expectedAwarded);
    expect(room.state.teams.A.phase).toBe("ASSEMBLY");
    expect(room.state.teams.A.excavation.discoveredBoneIds).toEqual(expectedAwarded);
    expect(room.phaseDurations.A.excavationMs).not.toBeNull();
    // ASSEMBLY 진입과 함께 다이노런이 무장된다.
    expect(room.state.teams.A.phaseEndsAt).not.toBeNull();
    expect(room.state.teams.A.dinoRun.obstacleOffsetsMs.length).toBeGreaterThan(0);
  });

  it("does nothing once the team has already left EXCAVATION", () => {
    const { rooms, room, playerA } = setupStartedRoom();
    room.state.teams.A.phase = "ASSEMBLY";
    const result = rooms.applyExcavation(
      room,
      "A",
      playerA,
      { seq: 1, count: 3, sourceCounts: { motion: 3, tap: 0 }, clientTime: Date.now() },
      Date.now(),
    );
    expect(result.accepted).toBe(false);
  });
});

describe("EXCAVATION_POINTS_PER_BONE wiring", () => {
  it("matches the initial nextBoneAt threshold on a fresh team", () => {
    const { room } = setupStartedRoom();
    expect(room.state.teams.A.excavation.nextBoneAt).toBe(EXCAVATION_POINTS_PER_BONE);
  });
});
