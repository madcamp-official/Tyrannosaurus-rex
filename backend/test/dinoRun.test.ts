import { describe, expect, it } from "vitest";
import {
  CHARGING_PRACTICE_DURATION_MS,
  CHARGING_START_STABILITY_BASE,
  DINO_RUN_DURATION_MS,
  METEOR_DODGE_LIVES,
  METEOR_FRUIT_SCORE_REWARD,
  METEOR_HEART_LIVES_RESTORED,
  METEOR_HEART_SCORE_REWARD,
  METEOR_HIT_SCORE_PENALTY,
  PHASE_START_GRACE_MS,
  ROUND_TRANSITION_MS,
  SKY_OBJECT_COUNT,
  SKY_OBJECT_FALL_MS,
} from "@trex/shared";
import { RoomManager } from "../src/rooms/RoomManager.js";
import { makeSkyObjectSchedule } from "../src/game/dinoRun.js";

function setupAssemblyRoom() {
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
  for (const teamId of ["A", "B"] as const) {
    const team = room.state.teams[teamId];
    team.phase = "ASSEMBLY";
    team.phaseStartedAt = now - PHASE_START_GRACE_MS;
    team.phaseEndsAt = now + DINO_RUN_DURATION_MS;
    team.dinoRun.skyObjects = makeSkyObjectSchedule(room.roundSeed!);
    for (const playerId of team.playerIds) {
      team.dinoRun.livesByPlayer[playerId] = METEOR_DODGE_LIVES;
    }
  }
  return { rooms, room, playerA: a.playerId, playerB: b.playerId, now };
}

/** A팀은 위치를 안 보내 모든 운석과 겹치는 화면 중앙(0.5)에 계속 있는 상태로 시간을 흘려보낸다. */
function setupChargingPracticeRoom() {
  const setup = setupAssemblyRoom();
  const { rooms, room, now } = setup;
  const evalNow = now + DINO_RUN_DURATION_MS + 1;
  rooms.tickDinoCollisions(room, evalNow);
  rooms.tickDinoRun(room, evalNow);
  rooms.tickDinoRunTransition(room, evalNow + ROUND_TRANSITION_MS + 1);
  for (const teamId of ["A", "B"] as const) {
    room.state.teams[teamId].phaseStartedAt = Date.now() - PHASE_START_GRACE_MS;
    room.state.teams[teamId].phaseEndsAt =
      room.state.teams[teamId].phaseStartedAt + PHASE_START_GRACE_MS + CHARGING_PRACTICE_DURATION_MS;
  }
  return setup;
}

describe("dino run (meteor dodge)", () => {
  it("generates a deterministic sky-object schedule shared by both teams", () => {
    const schedule1 = makeSkyObjectSchedule("seed-x");
    const schedule2 = makeSkyObjectSchedule("seed-x");
    const other = makeSkyObjectSchedule("seed-y");
    expect(schedule1).toEqual(schedule2);
    expect(schedule1).not.toEqual(other);
    expect(schedule1.length).toBe(SKY_OBJECT_COUNT);
    for (let i = 1; i < schedule1.length; i += 1) {
      expect(schedule1[i]!.hitAtMs).toBeGreaterThan(schedule1[i - 1]!.hitAtMs);
    }
    for (const obj of schedule1) {
      expect(obj.x).toBeGreaterThanOrEqual(0);
      expect(obj.x).toBeLessThanOrEqual(1);
      expect(["METEOR", "FRUIT", "HEART"]).toContain(obj.kind);
    }
  });

  it("tracks a player's latest reported position and rejects stale/out-of-order sequences", () => {
    const { rooms, room, playerA, now } = setupAssemblyRoom();
    const first = rooms.applyDinoPositionInput(room, "A", playerA, { seq: 1, x: 0.2, clientTime: now }, now);
    expect(first).toBe(true);
    expect(room.dinoPositionState.get(playerA)?.x).toBe(0.2);

    const stale = rooms.applyDinoPositionInput(room, "A", playerA, { seq: 1, x: 0.9, clientTime: now }, now);
    expect(stale).toBe(false);
    expect(room.dinoPositionState.get(playerA)?.x).toBe(0.2);

    const next = rooms.applyDinoPositionInput(room, "A", playerA, { seq: 2, x: 0.8, clientTime: now }, now);
    expect(next).toBe(true);
    expect(room.dinoPositionState.get(playerA)?.x).toBe(0.8);
  });

  it("rejects position updates outside the ASSEMBLY phase", () => {
    const { rooms, room, playerA, now } = setupAssemblyRoom();
    room.state.teams.A.phase = "EXCAVATION";
    const accepted = rooms.applyDinoPositionInput(room, "A", playerA, { seq: 1, x: 0.5, clientTime: now }, now);
    expect(accepted).toBe(false);
  });

  it(
    "regression: never judges collisions before PHASE_START_GRACE_MS, even if a meteor's " +
      "hitAtMs has already passed (mobile controls aren't mounted yet, so a player's position " +
      "is always the 0.5 default and would otherwise be a guaranteed hit)",
    () => {
      const { rooms, room, playerA, now } = setupAssemblyRoom();
      const meteor = { id: 0, hitAtMs: 1000, x: 0.5, kind: "METEOR" as const };
      room.state.teams.A.phaseStartedAt = now;
      room.state.teams.A.dinoRun.skyObjects = [meteor];
      // 플레이어는 아직 위치를 한 번도 보고하지 않았다(모바일 화면이 아직 "준비 중").

      const events = rooms.tickDinoCollisions(room, now + PHASE_START_GRACE_MS - 1);
      expect(events).toEqual([]);
      expect(room.state.teams.A.dinoRun.livesByPlayer[playerA]).toBe(METEOR_DODGE_LIVES);
      expect(room.state.teams.A.dinoRun.scoreByPlayer[playerA] ?? 0).toBe(0);
      expect(room.dinoMeteorLockState.has(`${playerA}:0`)).toBe(false);
    },
  );

  it("hits a player standing under a meteor: loses a life, loses score, and is judged only once", () => {
    const { rooms, room, playerA, now } = setupAssemblyRoom();
    const meteor = { id: 0, hitAtMs: 8000, x: 0.5, kind: "METEOR" as const };
    room.state.teams.A.dinoRun.skyObjects = [meteor];
    rooms.applyDinoPositionInput(room, "A", playerA, { seq: 1, x: meteor.x, clientTime: now }, now);

    const events = rooms.tickDinoCollisions(room, now + meteor.hitAtMs + 1);
    const hit = events.find((e) => e.teamId === "A" && e.event.kind === "HIT");
    expect(hit).toBeDefined();
    if (hit && hit.event.kind === "HIT") {
      expect(hit.event.playerId).toBe(playerA);
      expect(hit.event.livesLeft).toBe(METEOR_DODGE_LIVES - 1);
      expect(hit.event.score).toBe(-METEOR_HIT_SCORE_PENALTY);
    }
    expect(room.state.teams.A.dinoRun.livesByPlayer[playerA]).toBe(METEOR_DODGE_LIVES - 1);
    expect(room.state.teams.A.dinoRun.scoreByPlayer[playerA]).toBe(-METEOR_HIT_SCORE_PENALTY);

    // 같은 오브젝트는 같은 플레이어에게 두 번 판정되지 않는다.
    const again = rooms.tickDinoCollisions(room, now + meteor.hitAtMs + 500);
    expect(again.filter((e) => e.teamId === "A" && e.event.kind === "HIT")).toEqual([]);
  });

  it("dodging a meteor (moving away after it locks onto your spawn-time position) costs no life and counts toward MVP stats", () => {
    const { rooms, room, playerA, now } = setupAssemblyRoom();
    const meteor = { id: 0, hitAtMs: 8000, x: 0.5, kind: "METEOR" as const };
    room.state.teams.A.dinoRun.skyObjects = [meteor];

    // 운석이 낙하를 시작하는 순간(스폰 시각) 있던 자리(0)로 목표가 고정된다.
    rooms.applyDinoPositionInput(room, "A", playerA, { seq: 1, x: 0, clientTime: now }, now);
    rooms.tickDinoCollisions(room, now + meteor.hitAtMs - SKY_OBJECT_FALL_MS + 1);
    expect(room.dinoMeteorLockState.get(`${playerA}:0`)).toBe(0);

    // 그 뒤 반대쪽으로 이동해 고정된 목표 지점을 벗어나면 피한 것으로 인정된다.
    rooms.applyDinoPositionInput(room, "A", playerA, { seq: 2, x: 1, clientTime: now }, now);
    const events = rooms.tickDinoCollisions(room, now + meteor.hitAtMs + 1);
    expect(events.filter((e) => e.teamId === "A")).toEqual([]);
    expect(room.state.teams.A.dinoRun.livesByPlayer[playerA]).toBe(METEOR_DODGE_LIVES);
    const player = room.state.players.find((p) => p.id === playerA)!;
    expect(player.stats.dinoCleared).toBe(1);
  });

  it("locks a meteor's target to the player's position at spawn time, not at judgment time", () => {
    const { rooms, room, playerA, now } = setupAssemblyRoom();
    const meteor = { id: 0, hitAtMs: 8000, x: 0.5, kind: "METEOR" as const };
    room.state.teams.A.dinoRun.skyObjects = [meteor];

    // 스폰 전에는 아직 고정되지 않는다.
    rooms.applyDinoPositionInput(room, "A", playerA, { seq: 1, x: 0.2, clientTime: now }, now);
    rooms.tickDinoCollisions(room, now + meteor.hitAtMs - SKY_OBJECT_FALL_MS - 100);
    expect(room.dinoMeteorLockState.has(`${playerA}:0`)).toBe(false);

    // 스폰 시각이 지나면 그 순간의 위치로 고정되고, 그 뒤 위치를 옮겨도 고정값은 안 바뀐다.
    rooms.applyDinoPositionInput(room, "A", playerA, { seq: 2, x: 0.7, clientTime: now }, now);
    rooms.tickDinoCollisions(room, now + meteor.hitAtMs - SKY_OBJECT_FALL_MS + 50);
    expect(room.dinoMeteorLockState.get(`${playerA}:0`)).toBe(0.7);

    rooms.applyDinoPositionInput(room, "A", playerA, { seq: 3, x: 0.1, clientTime: now }, now);
    rooms.tickDinoCollisions(room, now + meteor.hitAtMs - SKY_OBJECT_FALL_MS + 100);
    expect(room.dinoMeteorLockState.get(`${playerA}:0`)).toBe(0.7);
  });

  it("catching a fruit adds score without costing a life; missing one has no penalty", () => {
    const { rooms, room, playerA, now } = setupAssemblyRoom();
    const fruit = { id: 0, hitAtMs: 8000, x: 0.5, kind: "FRUIT" as const };
    room.state.teams.A.dinoRun.skyObjects = [fruit];
    rooms.applyDinoPositionInput(room, "A", playerA, { seq: 1, x: fruit.x, clientTime: now }, now);

    const events = rooms.tickDinoCollisions(room, now + fruit.hitAtMs + 1);
    const caught = events.find((e) => e.teamId === "A" && e.event.kind === "BONUS");
    expect(caught).toBeDefined();
    if (caught && caught.event.kind === "BONUS") {
      expect(caught.event.pickupKind).toBe("FRUIT");
      expect(caught.event.score).toBe(METEOR_FRUIT_SCORE_REWARD);
      expect(caught.event.livesLeft).toBe(METEOR_DODGE_LIVES);
    }
    expect(room.state.teams.A.dinoRun.livesByPlayer[playerA]).toBe(METEOR_DODGE_LIVES);
    expect(room.state.teams.A.dinoRun.scoreByPlayer[playerA]).toBe(METEOR_FRUIT_SCORE_REWARD);
  });

  it("catching a heart restores a life (capped at the max) and adds score", () => {
    const { rooms, room, playerA, now } = setupAssemblyRoom();
    room.state.teams.A.dinoRun.livesByPlayer[playerA] = METEOR_DODGE_LIVES - 1;
    const heart = { id: 0, hitAtMs: 8000, x: 0.5, kind: "HEART" as const };
    room.state.teams.A.dinoRun.skyObjects = [heart];
    rooms.applyDinoPositionInput(room, "A", playerA, { seq: 1, x: heart.x, clientTime: now }, now);

    const events = rooms.tickDinoCollisions(room, now + heart.hitAtMs + 1);
    const caught = events.find((e) => e.teamId === "A" && e.event.kind === "BONUS");
    expect(caught).toBeDefined();
    if (caught && caught.event.kind === "BONUS") {
      expect(caught.event.pickupKind).toBe("HEART");
      expect(caught.event.score).toBe(METEOR_HEART_SCORE_REWARD);
      expect(caught.event.livesLeft).toBe(METEOR_DODGE_LIVES - 1 + METEOR_HEART_LIVES_RESTORED);
    }
    expect(room.state.teams.A.dinoRun.livesByPlayer[playerA]).toBe(METEOR_DODGE_LIVES);
  });

  it("catching a heart at full lives does not exceed the max life cap", () => {
    const { rooms, room, playerA, now } = setupAssemblyRoom();
    const heart = { id: 0, hitAtMs: 8000, x: 0.5, kind: "HEART" as const };
    room.state.teams.A.dinoRun.skyObjects = [heart];
    rooms.applyDinoPositionInput(room, "A", playerA, { seq: 1, x: heart.x, clientTime: now }, now);

    rooms.tickDinoCollisions(room, now + heart.hitAtMs + 1);
    expect(room.state.teams.A.dinoRun.livesByPlayer[playerA]).toBe(METEOR_DODGE_LIVES);
  });

  it("eliminates a player after losing all lives, and no longer judges collisions for them", () => {
    const { rooms, room, playerA, now } = setupAssemblyRoom();
    const meteors = Array.from({ length: METEOR_DODGE_LIVES }, (_, i) => ({
      id: i,
      hitAtMs: 8000 + i * 1000,
      x: 0.5,
      kind: "METEOR" as const,
    }));
    room.state.teams.A.dinoRun.skyObjects = meteors;

    let deathEvent: { teamId: string; event: { kind: string } } | undefined;
    for (const meteor of meteors) {
      rooms.applyDinoPositionInput(room, "A", playerA, { seq: meteor.id + 1, x: meteor.x, clientTime: now }, now);
      const events = rooms.tickDinoCollisions(room, now + meteor.hitAtMs + 1);
      const death = events.find((e) => e.teamId === "A" && e.event.kind === "DEATH");
      if (death) deathEvent = death;
    }
    expect(deathEvent).toBeDefined();
    expect(room.state.teams.A.dinoRun.deadPlayerIds).toEqual([playerA]);
    expect(room.state.teams.A.dinoRun.livesByPlayer[playerA]).toBe(0);

    const afterDeath = rooms.applyDinoPositionInput(room, "A", playerA, { seq: 999, x: 0.5, clientTime: now }, now);
    expect(afterDeath).toBe(false);
  });

  it(
    "evaluates the run after 1 minute, decides WIN/LOSE by normalized score, and moves both teams to " +
      "CHARGING_PRACTICE immediately without returning to the previous screen",
    () => {
      const { rooms, room, playerA, now } = setupAssemblyRoom();
      // A팀은 과일을 전부 잡고, B팀은 아무 것도 하지 않는다.
      const fruits = Array.from({ length: 3 }, (_, i) => ({
        id: i,
        hitAtMs: 8000 + i * 1000,
        x: 0.5,
        kind: "FRUIT" as const,
      }));
      room.state.teams.A.dinoRun.skyObjects = fruits;
      room.state.teams.B.dinoRun.skyObjects = [];
      for (const fruit of fruits) {
        rooms.applyDinoPositionInput(room, "A", playerA, { seq: fruit.id + 1, x: fruit.x, clientTime: now }, now);
        rooms.tickDinoCollisions(room, now + fruit.hitAtMs + 1);
      }

      const evalNow = now + DINO_RUN_DURATION_MS + 1;
      const { finished, teamResults } = rooms.tickDinoRun(room, evalNow);
      expect(finished.map((f) => f.teamId).sort()).toEqual(["A", "B"]);

      const a = finished.find((f) => f.teamId === "A")!.result;
      const b = finished.find((f) => f.teamId === "B")!.result;
      expect(a.performance).toBeGreaterThan(0);
      expect(b.performance).toBe(0);
      expect(b.grade).toBe("MESSY");
      expect(b.startStability).toBe(CHARGING_START_STABILITY_BASE);

      // 두 팀 다 끝나 승/패가 갈리면 이전 화면을 다시 보여주지 않고 즉시 영점 연습으로 넘어간다.
      expect(teamResults).toContainEqual({ teamId: "A", result: "WIN", score: room.state.teams.A.scores.dinoRun });
      expect(teamResults).toContainEqual({ teamId: "B", result: "LOSE", score: room.state.teams.B.scores.dinoRun });
      expect(room.state.teams.A.phase).toBe("ASSEMBLY");
      const transitioned = rooms.tickDinoRunTransition(room, evalNow);
      expect(transitioned).toBe(true);

      for (const teamId of ["A", "B"] as const) {
        expect(room.state.teams[teamId].phase).toBe("CHARGING_PRACTICE");
        expect(room.state.teams[teamId].phaseEndsAt).not.toBeNull();
        expect(room.state.teams[teamId].dinoRun.result).toBeNull();
        expect(room.state.teams[teamId].dinoRun.performance).toBeNull();
      }
      expect(room.state.teams.B.charging.stability).toBe(CHARGING_START_STABILITY_BASE);
      expect(room.phaseDurations.A.assemblyMs).not.toBeNull();
      // 연습 중에는 아직 공유 스켈레톤/충전 시작 시각이 잡히지 않는다 — 실제 CHARGING 진입 시점으로 미룬다.
      expect(room.sharedTrexStartedAt).toBeNull();
      expect(room.chargingStartedAt.A).toBeNull();

      // 회귀 방지: 전환 직후 다음 틱에서 tickDinoRun을 다시 불러도 이미 넘어간 팀을 대상으로
      // WIN/LOSE 비교·재전환이 다시 예약되면 안 된다 (phaseEndsAt이 계속 밀리는 버그였다).
      const rechecked = rooms.tickDinoRun(room, evalNow + 200);
      expect(rechecked.teamResults).toEqual([]);
      expect(room.dinoRunTransitionAt).toBeNull();
    },
  );

  it("marks both teams DRAW when normalized scores tie", () => {
    const { rooms, room, now } = setupAssemblyRoom();
    // 아무도 움직이지 않아 둘 다 점수 0으로 동률 — DRAW로 표시된다.
    const { teamResults } = rooms.tickDinoRun(room, now + DINO_RUN_DURATION_MS + 1);
    expect(teamResults).toContainEqual({ teamId: "A", result: "DRAW", score: room.state.teams.A.scores.dinoRun });
    expect(teamResults).toContainEqual({ teamId: "B", result: "DRAW", score: room.state.teams.B.scores.dinoRun });
  });

  it("moves a team from CHARGING_PRACTICE to real CHARGING once the 15s practice window ends", () => {
    const { rooms, room } = setupChargingPracticeRoom();
    expect(room.state.teams.A.phase).toBe("CHARGING_PRACTICE");

    const practiceEndsAt = room.state.teams.A.phaseEndsAt!;
    const tooEarly = rooms.tickChargingPractice(room, practiceEndsAt - 1);
    expect(tooEarly).toEqual([]);
    expect(room.state.teams.A.phase).toBe("CHARGING_PRACTICE");

    const finished = rooms.tickChargingPractice(room, practiceEndsAt + 1);
    expect(finished.sort()).toEqual(["A", "B"]);
    for (const teamId of ["A", "B"] as const) {
      expect(room.state.teams[teamId].phase).toBe("CHARGING");
      expect(room.state.teams[teamId].phaseEndsAt).not.toBeNull();
      expect(room.chargingStartedAt[teamId]).not.toBeNull();
    }
    expect(room.sharedTrexStartedAt).not.toBeNull();
  });

  it("accepts aim:update but rejects energy:fire during CHARGING_PRACTICE", () => {
    const { rooms, room, playerA } = setupChargingPracticeRoom();
    expect(room.state.teams.A.phase).toBe("CHARGING_PRACTICE");

    const aimAccepted = rooms.applyAim(
      room,
      "A",
      playerA,
      { seq: 1, point: { x: 0.5, y: 0.5 }, mode: "TOUCHPAD", calibrated: true, clientTime: Date.now() },
      Date.now(),
    );
    expect(aimAccepted).toBe(true);

    const fireOutcome = rooms.fireEnergy(room, "A", playerA, "shot-1", Date.now());
    expect(fireOutcome.accepted).toBe(false);
    expect(fireOutcome.reason).toBe("WRONG_TEAM_PHASE");
  });

  it("does not finish the practice window before CHARGING_PRACTICE_DURATION_MS has passed", () => {
    const { rooms, room } = setupChargingPracticeRoom();
    const practiceStart = room.state.teams.A.phaseStartedAt;

    const finished = rooms.tickChargingPractice(room, practiceStart + CHARGING_PRACTICE_DURATION_MS - 1000);
    expect(finished).toEqual([]);
    expect(room.state.teams.A.phase).toBe("CHARGING_PRACTICE");
  });

  it("keeps the full practice window even after every player has calibrated", () => {
    const { rooms, room, playerA } = setupChargingPracticeRoom();
    const practiceStart = room.state.teams.A.phaseStartedAt;

    rooms.applyAim(
      room,
      "A",
      playerA,
      { seq: 1, point: { x: 0.5, y: 0.5 }, mode: "GYRO", calibrated: true, clientTime: Date.now() },
      Date.now(),
    );

    // 전원이 영점을 잡았더라도 안내된 연습 시간은 끝까지 보장한다.
    const finished = rooms.tickChargingPractice(room, practiceStart + CHARGING_PRACTICE_DURATION_MS - 1000);
    expect(finished).toEqual([]);
    expect(room.state.teams.A.phase).toBe("CHARGING_PRACTICE");
    expect(room.state.teams.B.phase).toBe("CHARGING_PRACTICE");
  });

  it("does not finish the run before the 1-minute deadline", () => {
    const { rooms, room, now } = setupAssemblyRoom();
    const { finished } = rooms.tickDinoRun(room, now + DINO_RUN_DURATION_MS - 1000);
    expect(finished).toEqual([]);
    expect(room.state.teams.A.phase).toBe("ASSEMBLY");
  });
});
