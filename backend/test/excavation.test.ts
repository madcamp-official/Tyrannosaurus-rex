import { describe, expect, it } from "vitest";
import { BONE_IDS, EXCAVATION_MAX_INPUTS_PER_SECOND, EXCAVATION_POINTS_PER_BONE, PHASE_START_GRACE_MS, ROUND_TRANSITION_MS } from "@trex/shared";
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
  // 라운드는 이제 ASSEMBLY(운석 피하기)로 시작한다 — 발굴 로직만 단독으로 테스트하기 위해
  // 이미 운석 피하기를 끝내고 막 EXCAVATION에 들어온 상태로 강제 이동시킨다.
  for (const teamId of ["A", "B"] as const) {
    const team = created.room.state.teams[teamId];
    team.phase = "EXCAVATION";
    team.phaseEndsAt = null;
  }
  created.room.state.teams.A.phaseStartedAt -= PHASE_START_GRACE_MS;
  created.room.state.teams.B.phaseStartedAt -= PHASE_START_GRACE_MS;
  return { rooms, room: created.room, playerA: a.playerId, playerB: b.playerId };
}

/** 판정 창(레이트리밋)이 안 걸리게 1초씩 떼어 넣으며 그 팀의 발굴을 끝까지 채운다. */
function digUntilDone(
  rooms: RoomManager,
  room: ReturnType<typeof setupStartedRoom>["room"],
  teamId: "A" | "B",
  playerId: string,
  startNow: number,
): number {
  let seq = 1;
  let now = startNow;
  for (let i = 0; i < 200 && room.state.teams[teamId].excavation.discoveredBoneIds.length < BONE_IDS.length; i += 1) {
    now += 1000;
    rooms.applyExcavation(room, teamId, playerId, { seq: seq++, count: 5, sourceCounts: { motion: 5, tap: 0 }, clientTime: now }, now);
  }
  return now;
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

  it("awards bones in the room's seeded order", () => {
    const { rooms, room, playerA } = setupStartedRoom();
    const expectedOrder = room.boneOrder;
    expect(expectedOrder).toHaveLength(BONE_IDS.length);

    digUntilDone(rooms, room, "A", playerA, Date.now());

    // 인원이 적어도(팀당 1명) 뼈는 항상 13개 전부 나온다 — 웨이브당 여러 개씩 몰아서 나올 뿐.
    expect(room.state.teams.A.excavation.discoveredBoneIds).toEqual(expectedOrder);
    expect(room.phaseDurations.A.excavationMs).not.toBeNull();
  });

  it("팀당 1명이면 4웨이브(3,3,3,4개)로 나눠 발굴하지만 결국 뼈 13개를 전부 모은다", () => {
    const { rooms, room, playerA } = setupStartedRoom();
    let seq = 1;
    let now = Date.now();

    // 첫 웨이브(60점) 미만: 아직 아무 뼈도 안 나온다.
    now += 1000;
    rooms.applyExcavation(room, "A", playerA, { seq: seq++, count: 5, sourceCounts: { motion: 5, tap: 0 }, clientTime: now }, now);
    expect(room.state.teams.A.excavation.discoveredBoneIds).toHaveLength(0);

    // 60점을 채우는 즉시 첫 웨이브가 한 번에 3개를 내준다 (4웨이브: 3,3,3,4).
    while (room.state.teams.A.excavation.points < EXCAVATION_POINTS_PER_BONE) {
      now += 1000;
      rooms.applyExcavation(room, "A", playerA, { seq: seq++, count: 5, sourceCounts: { motion: 5, tap: 0 }, clientTime: now }, now);
    }
    expect(room.state.teams.A.excavation.discoveredBoneIds).toHaveLength(3);

    digUntilDone(rooms, room, "A", playerA, now);
    expect(room.state.teams.A.excavation.discoveredBoneIds).toHaveLength(BONE_IDS.length);
  });

  it("먼저 끝난 팀은 WIN으로 상대를 기다리고, 상대도 끝나면 LOSE 뒤 대기 시간 후 둘 다 CHARGING_PRACTICE로 전환된다", () => {
    const { rooms, room, playerA, playerB } = setupStartedRoom();
    const start = Date.now();

    const afterA = digUntilDone(rooms, room, "A", playerA, start);
    // A가 먼저 끝났고 B는 아직이라, WIN으로 표시된 채 EXCAVATION에 머물며 기다린다.
    expect(room.state.teams.A.excavation.result).toBe("WIN");
    expect(room.state.teams.A.phase).toBe("EXCAVATION");
    expect(rooms.tickExcavationTransition(room, afterA)).toBe(false);

    const afterB = digUntilDone(rooms, room, "B", playerB, afterA);
    // B가 이제 끝났으니 LOSE, 이 시점부터 ROUND_TRANSITION_MS 뒤 전환이 예약된다.
    expect(room.state.teams.B.excavation.result).toBe("LOSE");
    expect(room.state.teams.B.phase).toBe("EXCAVATION");

    expect(rooms.tickExcavationTransition(room, afterB)).toBe(false);
    const transitioned = rooms.tickExcavationTransition(room, afterB + ROUND_TRANSITION_MS + 1);
    expect(transitioned).toBe(true);

    for (const teamId of ["A", "B"] as const) {
      expect(room.state.teams[teamId].phase).toBe("CHARGING_PRACTICE");
      expect(room.state.teams[teamId].excavation.result).toBeNull();
      expect(room.state.teams[teamId].phaseEndsAt).not.toBeNull();
    }
  });

  it("마무리 시각이 EXCAVATION_DRAW_WINDOW_MS 안이면 두 팀 다 DRAW로 정정된다", () => {
    const { rooms, room, playerA, playerB } = setupStartedRoom();
    const start = Date.now();

    // 두 팀 다 목표치·투입 패턴이 동일해, 같은 시작 시각으로 각자 끝까지 파면 정확히 같은
    // 시각에 완료된다 — 사실상 동시 완료를 재현하는 가장 간단한 방법이다.
    const afterA = digUntilDone(rooms, room, "A", playerA, start);
    expect(room.state.teams.A.excavation.result).toBe("WIN");

    const afterB = digUntilDone(rooms, room, "B", playerB, start);
    expect(afterB).toBe(afterA);
    expect(room.state.teams.A.excavation.result).toBe("DRAW");
    expect(room.state.teams.B.excavation.result).toBe("DRAW");

    const transitioned = rooms.tickExcavationTransition(room, afterB + ROUND_TRANSITION_MS + 1);
    expect(transitioned).toBe(true);
    for (const teamId of ["A", "B"] as const) {
      expect(room.state.teams[teamId].phase).toBe("CHARGING_PRACTICE");
      expect(room.state.teams[teamId].excavation.result).toBeNull();
    }
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
