import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CHARGING_STAGE_DURATION_MS, CHARGING_STAGE_INTRO_MS, ENERGY_TARGET, FINAL_STAGE_CORE_TIMEOUT_MS, PHASE_START_GRACE_MS, SHOT_COOLDOWN_MS } from "@trex/shared";
import { RoomManager, type RoomRecord } from "../src/rooms/RoomManager.js";
import { computeActiveCore, computeTrexTransform, CORE_OFFSETS } from "../src/game/charging.js";

/** 방의 실제 roundSeed로 계산한 정확한 코어 좌표를 조준해, 시드 값과 무관하게 코어 명중을 보장한다. */
function aimAtCore(room: RoomRecord, now: number) {
  const trex = computeTrexTransform(room, now);
  const { core } = computeActiveCore(room, now);
  const offset = CORE_OFFSETS[core];
  return { x: trex.position.x + offset.x, y: trex.position.y + offset.y };
}

function setupChargingRoom() {
  const rooms = new RoomManager("https://trex.example.com");
  const created = rooms.createRoom("host-1", "테스트 방", 5)!;
  const roomCode = created.room.state.roomCode;
  const a = rooms.joinRoom(roomCode, "A1", "socket-a1");
  const b = rooms.joinRoom(roomCode, "B1", "socket-b1");
  if (!a.ok || !b.ok) throw new Error("join failed");
  rooms.setReady(roomCode, a.playerId, true);
  rooms.setReady(roomCode, b.playerId, true);
  rooms.startGame(created.room);

  const room = created.room;
  const now = Date.now();
  room.state.teams.A.phase = "CHARGING";
  room.state.teams.A.phaseStartedAt = now - PHASE_START_GRACE_MS;
  room.chargingStartedAt.A = now - CHARGING_STAGE_INTRO_MS;
  room.sharedTrexStartedAt = now;
  room.aimState.set(a.playerId, { point: aimAtCore(room, now), mode: "TOUCHPAD", calibrated: true, receivedAt: now, lastSeq: 1 });

  return { rooms, room, playerA: a.playerId, playerB: b.playerId, now };
}

describe("energy:fire", () => {
  it("rejects fire outside CHARGING", () => {
    const { rooms, room, playerA } = setupChargingRoom();
    room.state.teams.A.phase = "ASSEMBLY";
    const outcome = rooms.fireEnergy(room, "A", playerA, randomUUID(), Date.now());
    expect(outcome.accepted).toBe(false);
    expect(outcome.reason).toBe("WRONG_TEAM_PHASE");
  });

  it("rejects fire with no recent aim update", () => {
    const rooms = new RoomManager("https://trex.example.com");
    const created = rooms.createRoom("host-1", "테스트 방", 5)!;
    const roomCode = created.room.state.roomCode;
    const a = rooms.joinRoom(roomCode, "A1", "socket-a1");
    const b = rooms.joinRoom(roomCode, "B1", "socket-b1");
    if (!a.ok || !b.ok) throw new Error("join failed");
    rooms.setReady(roomCode, a.playerId, true);
    rooms.setReady(roomCode, b.playerId, true);
    rooms.startGame(created.room);
    created.room.state.teams.A.phase = "CHARGING";
    created.room.state.teams.A.phaseStartedAt = Date.now() - PHASE_START_GRACE_MS;

    const outcome = rooms.fireEnergy(created.room, "A", a.playerId, randomUUID(), Date.now());
    expect(outcome.accepted).toBe(false);
    expect(outcome.reason).toBe("INVALID_PAYLOAD");
  });

  it("rejects fire with a stale aim point (>500ms old)", () => {
    const { rooms, room, playerA, now } = setupChargingRoom();
    const outcome = rooms.fireEnergy(room, "A", playerA, randomUUID(), now + 600);
    expect(outcome.accepted).toBe(false);
    expect(outcome.reason).toBe("INVALID_PAYLOAD");
  });

  it("enforces the shot cooldown", () => {
    const { rooms, room, playerA, now } = setupChargingRoom();
    const first = rooms.fireEnergy(room, "A", playerA, randomUUID(), now);
    expect(first.accepted).toBe(true);
    const second = rooms.fireEnergy(room, "A", playerA, randomUUID(), now + 10);
    expect(second.accepted).toBe(false);
    expect(second.reason).toBe("SHOT_COOLDOWN");
  });

  it("rejects a duplicate shotId", () => {
    const { rooms, room, playerA, now } = setupChargingRoom();
    const shotId = randomUUID();
    const first = rooms.fireEnergy(room, "A", playerA, shotId, now);
    expect(first.accepted).toBe(true);
    const dup = rooms.fireEnergy(room, "A", playerA, shotId, now + SHOT_COOLDOWN_MS + 10);
    expect(dup.accepted).toBe(false);
    expect(dup.reason).toBe("DUPLICATE_REQUEST");
  });

  it("resolves an on-core aim as a core hit and awards coreHits stat", () => {
    const { rooms, room, playerA, now } = setupChargingRoom();
    const outcome = rooms.fireEnergy(room, "A", playerA, randomUUID(), now);
    expect(outcome.accepted).toBe(true);
    expect(outcome.hit).toBe(true);
    expect(["HEART", "SKULL", "SPINE"]).toContain(outcome.hitZone);
    expect(outcome.energyDelta).toBeGreaterThan(0);
    const player = room.state.players.find((p) => p.id === playerA)!;
    expect(player.stats.shots).toBe(1);
    expect(player.stats.hits).toBe(1);
    expect(player.stats.coreHits).toBe(1);
  });

  it("rejects fire while a team is recovering from a phase 3 hit", () => {
    const { rooms, room, playerA, now } = setupChargingRoom();
    room.state.teams.A.charging.finalStunnedUntil = now + 2_000;

    const outcome = rooms.fireEnergy(room, "A", playerA, randomUUID(), now);

    expect(outcome.accepted).toBe(false);
    expect(outcome.reason).toBe("FINAL_STAGE_STUNNED");
  });

  it("moves the shared target to a different core immediately after a valid hit", () => {
    const { rooms, room, playerA, now } = setupChargingRoom();
    const before = computeActiveCore(room, now).core;

    const outcome = rooms.fireEnergy(room, "A", playerA, randomUUID(), now);

    expect(outcome.coreChanged?.from).toBe(before);
    expect(outcome.coreChanged?.to).not.toBe(before);
    expect(computeActiveCore(room, now).core).toBe(outcome.coreChanged?.to);
    expect(room.state.teams.A.charging.activeCore).toBe(outcome.coreChanged?.to);
    expect(room.state.teams.B.charging.activeCore).toBe(outcome.coreChanged?.to);
  });

  it("awards no hit, energy, or personal score for a body shot outside the active target", () => {
    const { rooms, room, playerA, now } = setupChargingRoom();
    const trex = computeTrexTransform(room, now);
    room.aimState.set(playerA, {
      point: { x: trex.position.x, y: trex.position.y + 0.12 },
      mode: "TOUCHPAD",
      calibrated: true,
      receivedAt: now,
      lastSeq: 2,
    });

    const outcome = rooms.fireEnergy(room, "A", playerA, randomUUID(), now);
    const player = room.state.players.find((p) => p.id === playerA)!;

    expect(outcome.hit).toBe(false);
    expect(outcome.hitZone).toBeNull();
    expect(outcome.energyDelta).toBe(0);
    expect(outcome.coreChanged).toBeNull();
    expect(player.stats.shots).toBe(1);
    expect(player.stats.hits).toBe(0);
    expect(player.stats.coreHits).toBe(0);
    expect(player.stats.energyContributed).toBe(0);
  });

  it("treats the whole fleeing tyranno body as the target during phase 2", () => {
    const { rooms, room, playerA, now } = setupChargingRoom();
    room.chargingStartedAt.A = now - CHARGING_STAGE_DURATION_MS - CHARGING_STAGE_INTRO_MS;
    const trex = computeTrexTransform(room, now);
    room.aimState.set(playerA, {
      point: trex.position,
      mode: "TOUCHPAD",
      calibrated: true,
      receivedAt: now,
      lastSeq: 2,
    });

    const outcome = rooms.fireEnergy(room, "A", playerA, randomUUID(), now);

    expect(outcome.chargingStage).toBe(2);
    expect(outcome.hitZone).toBe("BONE");
    expect(outcome.energyDelta).toBe(2);
    expect(outcome.coreChanged).toBeNull();
  });

  it("resets the phase 3 danger timer when the active core is hit", () => {
    const { rooms, room, playerA, now } = setupChargingRoom();
    room.chargingStartedAt.A = now - CHARGING_STAGE_DURATION_MS * 2 - CHARGING_STAGE_INTRO_MS;
    room.state.teams.A.charging.finalCoreDeadlineAt = now + 1;
    room.aimState.set(playerA, { point: aimAtCore(room, now), mode: "TOUCHPAD", calibrated: true, receivedAt: now, lastSeq: 2 });

    const outcome = rooms.fireEnergy(room, "A", playerA, randomUUID(), now);

    expect(outcome.chargingStage).toBe(3);
    expect(outcome.coreChanged).not.toBeNull();
    expect(room.state.teams.A.charging.finalCoreDeadlineAt).toBe(now + FINAL_STAGE_CORE_TIMEOUT_MS);
  });

  it("damages and stuns the opponent after five consecutive phase 3 core hits", () => {
    const { rooms, room, playerA, now: startedAt } = setupChargingRoom();
    room.chargingStartedAt.A = startedAt - CHARGING_STAGE_DURATION_MS * 2 - CHARGING_STAGE_INTRO_MS;
    room.state.teams.B.phase = "CHARGING";
    room.state.teams.B.phaseStartedAt = startedAt - CHARGING_STAGE_DURATION_MS * 2;
    room.chargingStartedAt.B = startedAt - CHARGING_STAGE_DURATION_MS * 2 - CHARGING_STAGE_INTRO_MS;
    room.state.teams.B.charging.finalLives = 5;

    let now = startedAt;
    let outcome;
    for (let hit = 0; hit < 5; hit += 1) {
      now += SHOT_COOLDOWN_MS + 10;
      room.aimState.set(playerA, {
        point: aimAtCore(room, now),
        mode: "TOUCHPAD",
        calibrated: true,
        receivedAt: now,
        lastSeq: hit + 2,
      });
      outcome = rooms.fireEnergy(room, "A", playerA, randomUUID(), now);
    }

    expect(outcome?.finalDamage).toEqual({
      teamId: "B",
      livesLeft: 4,
      stunnedUntil: now + 2_000,
      transition: null,
    });
    expect(room.state.teams.B.charging.finalLives).toBe(4);
    expect(room.state.teams.B.charging.finalCoreDeadlineAt).toBe(now + FINAL_STAGE_CORE_TIMEOUT_MS);
  });

  it("reaches NORMAL revival once energy hits the target, scoring the game without ending the round early", () => {
    const { rooms, room, playerA } = setupChargingRoom();
    let now = Date.now();
    room.chargingStartedAt.A = now - CHARGING_STAGE_DURATION_MS * 2 - CHARGING_STAGE_INTRO_MS;
    let outcome;
    let guard = 0;
    while (room.state.teams.A.charging.energy < ENERGY_TARGET && guard < 100) {
      now += SHOT_COOLDOWN_MS + 10;
      room.aimState.set(playerA, { point: aimAtCore(room, now), mode: "TOUCHPAD", calibrated: true, receivedAt: now, lastSeq: guard + 2 });
      outcome = rooms.fireEnergy(room, "A", playerA, randomUUID(), now);
      guard += 1;
    }
    expect(room.state.teams.A.charging.energy).toBeGreaterThanOrEqual(ENERGY_TARGET);
    expect(room.state.teams.A.phase).toBe("CHARGING");
    expect(room.state.teams.A.charging.form).toBe("NONE");
    expect(room.state.teams.A.charging.targetReachedAt).not.toBeNull();
    expect(room.state.teams.A.scores.charging).toBeNull();
    // 팀 B는 아직 CHARGING을 마치지 않았으므로, 누적 점수제 하에서는 라운드가 아직 끝나지 않는다.
    expect(outcome?.roundFinalized).toBe(false);
    expect(room.state.roomPhase).toBe("PLAYING");
  });

  it("marks the first team to fill revival energy as WIN, and the other team LOSE once it also finishes", () => {
    const { rooms, room, playerA } = setupChargingRoom();
    let now = Date.now();
    room.chargingStartedAt.A = now - CHARGING_STAGE_DURATION_MS * 2 - CHARGING_STAGE_INTRO_MS;
    let guard = 0;
    while (room.state.teams.A.charging.energy < ENERGY_TARGET && guard < 100) {
      now += SHOT_COOLDOWN_MS + 10;
      room.aimState.set(playerA, { point: aimAtCore(room, now), mode: "TOUCHPAD", calibrated: true, receivedAt: now, lastSeq: guard + 2 });
      rooms.fireEnergy(room, "A", playerA, randomUUID(), now);
      guard += 1;
    }
    // 목표를 먼저 채워도 phase 3 종료 전에는 결과를 확정하지 않는다.
    expect(room.state.teams.A.phase).toBe("CHARGING");
    expect(room.state.teams.A.charging.result).toBeNull();
    expect(room.state.teams.B.charging.result).toBeNull();

    room.state.teams.A.phaseEndsAt = now;
    rooms.tickCharging(room, now + 1);
    expect(room.state.teams.A.phase).toBe("REVIVED");
    expect(room.state.teams.A.charging.form).toBe("NORMAL");
    expect(room.state.teams.A.charging.result).toBe("WIN");

    // 팀 B가 시간 초과로 나중에 REVIVED에 도달하면 LOSE로 표시된다(순서와 무관하게 YRANNO는 항상 LOSE).
    room.state.teams.B.phase = "CHARGING";
    room.state.teams.B.phaseEndsAt = now - 1;
    room.chargingStartedAt.B = now - 1000;
    rooms.tickCharging(room, now + 1000);
    expect(room.state.teams.B.phase).toBe("REVIVED");
    expect(room.state.teams.B.charging.form).toBe("YRANNO");
    expect(room.state.teams.B.charging.result).toBe("LOSE");
    // 먼저 이긴 팀의 결과는 그대로 유지된다.
    expect(room.state.teams.A.charging.result).toBe("WIN");
  });

  it("finalizes with the higher sum of individual player scores once both teams are revived", () => {
    const { rooms, room } = setupChargingRoom();
    room.state.teams.A.phase = "REVIVED";
    room.state.teams.A.charging.form = "NORMAL";
    room.state.teams.A.scores = { excavation: 80, dinoRun: 80, charging: 80 };
    room.state.teams.B.phase = "REVIVED";
    room.state.teams.B.charging.form = "YRANNO";
    room.state.teams.B.scores = { excavation: 40, dinoRun: 40, charging: 40 };
    room.state.players.find((player) => player.teamId === "A")!.stats.excavationInputs = 80;
    room.state.players.find((player) => player.teamId === "B")!.stats.excavationInputs = 40;

    const finalized = rooms.checkRoundCompletion(room, Date.now());
    expect(finalized).toBe(true);
    expect(room.state.roomPhase).toBe("RESULT");
    expect(room.state.winner).toEqual({ teamId: "A", reason: "SCORE_TOTAL" });
  });

  it("compares per-player average score so a larger team's higher raw total doesn't automatically win", () => {
    const rooms = new RoomManager("https://trex.example.com");
    const created = rooms.createRoom("host-1", "테스트 방", 5)!;
    const roomCode = created.room.state.roomCode;
    const a = rooms.joinRoom(roomCode, "A1", "socket-a1");
    const b1 = rooms.joinRoom(roomCode, "B1", "socket-b1");
    const b2 = rooms.joinRoom(roomCode, "B2", "socket-b2");
    if (!a.ok || !b1.ok || !b2.ok) throw new Error("join failed");
    expect(a.teamId).toBe("A");
    expect(b1.teamId).toBe("B");
    expect(b2.teamId).toBe("B");
    rooms.setReady(roomCode, a.playerId, true);
    rooms.setReady(roomCode, b1.playerId, true);
    rooms.setReady(roomCode, b2.playerId, true);
    rooms.startGame(created.room);

    const room = created.room;
    room.state.teams.A.phase = "REVIVED";
    room.state.teams.A.charging.form = "NORMAL";
    room.state.teams.B.phase = "REVIVED";
    room.state.teams.B.charging.form = "NORMAL";
    // 팀 B의 총합(40+40=80)은 팀 A(60)보다 높지만, 인원이 2명이라 인당 평균(40)은 A(60)보다 낮다.
    room.state.players.find((player) => player.id === a.playerId)!.stats.excavationInputs = 60;
    room.state.players.find((player) => player.id === b1.playerId)!.stats.excavationInputs = 40;
    room.state.players.find((player) => player.id === b2.playerId)!.stats.excavationInputs = 40;

    const finalized = rooms.checkRoundCompletion(room, Date.now());
    expect(finalized).toBe(true);
    expect(room.state.winner).toEqual({ teamId: "A", reason: "SCORE_TOTAL" });
  });
});

describe("charging tick transitions", () => {
  it("removes a life when the phase 3 core timer expires", () => {
    const { rooms, room } = setupChargingRoom();
    const now = Date.now();
    room.chargingStartedAt.A = now - CHARGING_STAGE_DURATION_MS * 2 - CHARGING_STAGE_INTRO_MS;
    room.state.teams.A.charging.finalLives = 5;
    room.state.teams.A.charging.finalCoreDeadlineAt = now - 1;

    const { updates } = rooms.tickCharging(room, now);

    expect(room.state.teams.A.charging.finalLives).toBe(4);
    expect(room.state.teams.A.phase).toBe("CHARGING");
    expect(room.state.teams.A.charging.finalStunnedUntil).toBe(now + 2_000);
    expect(updates.find((update) => update.teamId === "A")?.finalDamage).toEqual({
      livesLeft: 4,
      stunnedUntil: now + 2_000,
    });
  });

  it("ends phase 3 as yranno when all five lives are lost", () => {
    const { rooms, room } = setupChargingRoom();
    const now = Date.now();
    room.chargingStartedAt.A = now - CHARGING_STAGE_DURATION_MS * 2 - CHARGING_STAGE_INTRO_MS;
    room.state.teams.A.charging.finalLives = 1;
    room.state.teams.A.charging.finalCoreDeadlineAt = now - 1;

    const { updates } = rooms.tickCharging(room, now);

    expect(room.state.teams.A.charging.finalLives).toBe(0);
    expect(room.state.teams.A.phase).toBe("REVIVED");
    expect(room.state.teams.A.charging.form).toBe("YRANNO");
    expect(updates.find((update) => update.teamId === "A")?.transition).toBe("TO_REVIVED_YRANNO");
  });

  it("turns a team into a permanent yranno once the charging timer expires without reaching the energy target", () => {
    const { rooms, room } = setupChargingRoom();
    const now = Date.now();
    room.state.teams.A.phaseEndsAt = now - 1;

    const { updates } = rooms.tickCharging(room, now);
    const teamAUpdate = updates.find((u) => u.teamId === "A");
    expect(teamAUpdate?.transition).toBe("TO_REVIVED_YRANNO");
    expect(room.state.teams.A.phase).toBe("REVIVED");
    expect(room.state.teams.A.charging.form).toBe("YRANNO");
  });

  it("finalizes as a DRAW once both teams end up REVIVED as yrannos", () => {
    const { rooms, room } = setupChargingRoom();
    room.state.teams.A.phase = "REVIVED";
    room.state.teams.A.charging.form = "YRANNO";
    room.state.teams.B.phase = "CHARGING";
    room.state.teams.B.charging.form = "YRANNO";
    room.state.teams.B.charging.stability = 10;
    const now = Date.now();
    room.state.teams.B.phaseEndsAt = now - 1;

    rooms.tickCharging(room, now);
    expect(room.state.teams.B.phase).toBe("REVIVED");
    expect(room.state.roomPhase).toBe("RESULT");
    expect(room.state.winner).toEqual({ teamId: null, reason: "DRAW" });
  });

  it("finalizes on round timeout even if both teams are still excavating", () => {
    const { rooms, room } = setupChargingRoom();
    room.state.teams.A.phase = "EXCAVATION";
    room.state.teams.B.phase = "EXCAVATION";
    room.state.roundEndsAt = Date.now() - 1;

    const finalized = rooms.checkRoundCompletion(room, Date.now());
    expect(finalized).toBe(true);
    expect(room.state.roomPhase).toBe("RESULT");
    expect(room.state.winner.reason === "TIME_LIMIT" || room.state.winner.reason === "DRAW").toBe(true);
  });
});
