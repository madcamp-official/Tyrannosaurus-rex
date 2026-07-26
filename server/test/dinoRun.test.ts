import { describe, expect, it } from "vitest";
import {
  CHARGING_START_STABILITY_BASE,
  DINO_JUMP_WINDOW_MS,
  DINO_OBSTACLE_COUNT,
  DINO_RUN_DURATION_MS,
} from "@trex/shared";
import { RoomManager } from "../src/rooms/RoomManager.js";
import { makeObstacleSchedule } from "../src/game/dinoRun.js";

function setupAssemblyRoom() {
  const rooms = new RoomManager("https://trex.example.com");
  const created = rooms.createRoom("host-1")!;
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
    team.phaseStartedAt = now;
    team.phaseEndsAt = now + DINO_RUN_DURATION_MS;
    team.dinoRun.obstacleOffsetsMs = makeObstacleSchedule(room.roundSeed!);
  }
  return { rooms, room, playerA: a.playerId, playerB: b.playerId, now };
}

describe("dino run", () => {
  it("generates a deterministic obstacle schedule shared by both teams", () => {
    const schedule1 = makeObstacleSchedule("seed-x");
    const schedule2 = makeObstacleSchedule("seed-x");
    const other = makeObstacleSchedule("seed-y");
    expect(schedule1).toEqual(schedule2);
    expect(schedule1).not.toEqual(other);
    expect(schedule1.length).toBe(DINO_OBSTACLE_COUNT);
    for (let i = 1; i < schedule1.length; i += 1) {
      expect(schedule1[i]!).toBeGreaterThan(schedule1[i - 1]!);
    }
  });

  it("clears an obstacle when a jump lands inside the window", () => {
    const { rooms, room, playerA, now } = setupAssemblyRoom();
    const offset = room.state.teams.A.dinoRun.obstacleOffsetsMs[0]!;
    const outcome = rooms.applyDinoJumpInput(room, "A", playerA, now + offset + DINO_JUMP_WINDOW_MS - 10);
    expect(outcome.accepted).toBe(true);
    if (outcome.accepted) {
      expect(outcome.cleared).toBe(true);
      expect(outcome.obstacleIndex).toBe(0);
      expect(outcome.clearedCount).toBe(1);
    }
    const player = room.state.players.find((p) => p.id === playerA)!;
    expect(player.stats.dinoCleared).toBe(1);
  });

  it("rejects jumps outside the window and duplicate clears of the same obstacle", () => {
    const { rooms, room, playerA, now } = setupAssemblyRoom();
    const offset = room.state.teams.A.dinoRun.obstacleOffsetsMs[0]!;

    const miss = rooms.applyDinoJumpInput(room, "A", playerA, now + offset - DINO_JUMP_WINDOW_MS - 200);
    expect(miss.accepted && !miss.cleared).toBe(true);

    const first = rooms.applyDinoJumpInput(room, "A", playerA, now + offset);
    expect(first.accepted && first.cleared).toBe(true);
    const dup = rooms.applyDinoJumpInput(room, "A", playerA, now + offset + 50);
    expect(dup.accepted && !dup.cleared).toBe(true);
  });

  it("rejects jumps outside the ASSEMBLY phase", () => {
    const { rooms, room, playerA, now } = setupAssemblyRoom();
    room.state.teams.A.phase = "EXCAVATION";
    const outcome = rooms.applyDinoJumpInput(room, "A", playerA, now);
    expect(outcome.accepted).toBe(false);
  });

  it("evaluates the run after 30s and moves both teams to CHARGING with scaled stability", () => {
    const { rooms, room, playerA, now } = setupAssemblyRoom();
    // A팀은 전부 클리어, B팀은 0개.
    for (const offset of room.state.teams.A.dinoRun.obstacleOffsetsMs) {
      const res = rooms.applyDinoJumpInput(room, "A", playerA, now + offset);
      expect(res.accepted && res.cleared).toBe(true);
    }

    const finished = rooms.tickDinoRun(room, now + DINO_RUN_DURATION_MS + 1);
    expect(finished.map((f) => f.teamId).sort()).toEqual(["A", "B"]);

    const a = finished.find((f) => f.teamId === "A")!.result;
    const b = finished.find((f) => f.teamId === "B")!.result;
    expect(a.performance).toBe(1);
    expect(a.grade).toBe("PERFECT");
    expect(a.startStability).toBe(100);
    expect(b.performance).toBe(0);
    expect(b.grade).toBe("MESSY");
    expect(b.startStability).toBe(CHARGING_START_STABILITY_BASE);

    for (const teamId of ["A", "B"] as const) {
      expect(room.state.teams[teamId].phase).toBe("CHARGING");
      expect(room.state.teams[teamId].phaseEndsAt).not.toBeNull();
    }
    expect(room.state.teams.A.charging.stability).toBe(100);
    expect(room.state.teams.B.charging.stability).toBe(CHARGING_START_STABILITY_BASE);
    expect(room.phaseDurations.A.assemblyMs).not.toBeNull();
  });

  it("does not finish the run before the 30s deadline", () => {
    const { rooms, room, now } = setupAssemblyRoom();
    const finished = rooms.tickDinoRun(room, now + DINO_RUN_DURATION_MS - 1000);
    expect(finished).toEqual([]);
    expect(room.state.teams.A.phase).toBe("ASSEMBLY");
  });
});
