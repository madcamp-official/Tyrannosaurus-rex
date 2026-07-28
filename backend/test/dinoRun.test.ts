import { describe, expect, it } from "vitest";
import {
  CHARGING_START_STABILITY_BASE,
  DINO_DEATH_GRACE_MS,
  DINO_JUMP_WINDOW_MS,
  DINO_OBSTACLE_COUNT,
  DINO_RUN_DURATION_MS,
  ROUND_TRANSITION_MS,
} from "@trex/shared";
import { RoomManager } from "../src/rooms/RoomManager.js";
import { makeObstacleSchedule } from "../src/game/dinoRun.js";

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

  it("obstacles come faster and faster (gaps shrink toward the end)", () => {
    const schedule = makeObstacleSchedule("speedup-seed");
    const firstGap = schedule[1]! - schedule[0]!;
    const lastGap = schedule[schedule.length - 1]! - schedule[schedule.length - 2]!;
    expect(lastGap).toBeLessThan(firstGap);
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

  it("evaluates the run after 30s, decides WIN/LOSE by clear rate, and moves both teams to CHARGING only after the wait", () => {
    const { rooms, room, playerA, now } = setupAssemblyRoom();
    // A팀은 전부 클리어, B팀은 0개.
    for (const offset of room.state.teams.A.dinoRun.obstacleOffsetsMs) {
      const res = rooms.applyDinoJumpInput(room, "A", playerA, now + offset);
      expect(res.accepted && res.cleared).toBe(true);
    }

    const evalNow = now + DINO_RUN_DURATION_MS + 1;
    const { finished, teamResults } = rooms.tickDinoRun(room, evalNow);
    expect(finished.map((f) => f.teamId).sort()).toEqual(["A", "B"]);

    const a = finished.find((f) => f.teamId === "A")!.result;
    const b = finished.find((f) => f.teamId === "B")!.result;
    expect(a.performance).toBe(1);
    expect(a.grade).toBe("PERFECT");
    expect(a.startStability).toBe(100);
    expect(b.performance).toBe(0);
    expect(b.grade).toBe("MESSY");
    expect(b.startStability).toBe(CHARGING_START_STABILITY_BASE);

    // 두 팀 다 끝나 곧바로 승/패는 갈리지만, 대기 시간이 지나기 전엔 CHARGING으로 넘어가지 않는다.
    expect(teamResults).toContainEqual({ teamId: "A", result: "WIN", score: room.state.teams.A.scores.dinoRun });
    expect(teamResults).toContainEqual({ teamId: "B", result: "LOSE", score: room.state.teams.B.scores.dinoRun });
    expect(room.state.teams.A.phase).toBe("ASSEMBLY");
    expect(rooms.tickDinoRunTransition(room, evalNow)).toBe(false);

    const transitioned = rooms.tickDinoRunTransition(room, evalNow + ROUND_TRANSITION_MS + 1);
    expect(transitioned).toBe(true);

    for (const teamId of ["A", "B"] as const) {
      expect(room.state.teams[teamId].phase).toBe("CHARGING");
      expect(room.state.teams[teamId].phaseEndsAt).not.toBeNull();
      expect(room.state.teams[teamId].dinoRun.result).toBeNull();
      expect(room.state.teams[teamId].dinoRun.performance).toBeNull();
    }
    expect(room.state.teams.A.charging.stability).toBe(100);
    expect(room.state.teams.B.charging.stability).toBe(CHARGING_START_STABILITY_BASE);
    expect(room.phaseDurations.A.assemblyMs).not.toBeNull();

    // 회귀 방지: 전환 직후 다음 틱에서 tickDinoRun을 다시 불러도 이미 CHARGING으로 넘어간
    // 팀을 대상으로 WIN/LOSE 비교·재전환이 다시 예약되면 안 된다 (phaseEndsAt이 계속
    // 밀리는 버그였다).
    const rechecked = rooms.tickDinoRun(room, evalNow + ROUND_TRANSITION_MS + 200);
    expect(rechecked.teamResults).toEqual([]);
    expect(room.dinoRunTransitionAt).toBeNull();
  });

  it("marks both teams DRAW when clear rates tie", () => {
    const { rooms, room, now } = setupAssemblyRoom();
    // 아무도 뛰지 않아 둘 다 0% 클리어로 동률 — DRAW로 표시된다.
    const { teamResults } = rooms.tickDinoRun(room, now + DINO_RUN_DURATION_MS + 1);
    expect(teamResults).toContainEqual({ teamId: "A", result: "DRAW", score: room.state.teams.A.scores.dinoRun });
    expect(teamResults).toContainEqual({ teamId: "B", result: "DRAW", score: room.state.teams.B.scores.dinoRun });
  });

  it("kills a player who lets an obstacle's window fully pass, and rejects further jumps from them", () => {
    const { rooms, room, playerA, now } = setupAssemblyRoom();
    const firstOffset = room.state.teams.A.dinoRun.obstacleOffsetsMs[0]!;

    // 창이 닫힌 직후는 아직 유예 시간(DINO_DEATH_GRACE_MS) 안이라 죽지 않는다 — 네트워크
    // 지연으로 창 끝자락에 보낸 점프가 늦게 도착할 여유를 준다.
    const beforeDeath = rooms.tickDinoDeaths(room, now + firstOffset + DINO_JUMP_WINDOW_MS + 10);
    expect(beforeDeath).toEqual([]);
    expect(room.state.teams.A.dinoRun.deadPlayerIds).toEqual([]);

    // A/B 모두 같은 roundSeed로 만든 동일한 장애물 스케줄을 쓰므로(§4 공정성), 두 팀 다 죽는다.
    const died = rooms.tickDinoDeaths(room, now + firstOffset + DINO_JUMP_WINDOW_MS + DINO_DEATH_GRACE_MS + 10);
    expect(died).toContainEqual({ teamId: "A", playerId: playerA });
    expect(room.state.teams.A.dinoRun.deadPlayerIds).toEqual([playerA]);

    // 다시 틱해도 이미 죽은 플레이어는 중복으로 보고되지 않는다.
    const again = rooms.tickDinoDeaths(room, now + firstOffset + DINO_JUMP_WINDOW_MS + DINO_DEATH_GRACE_MS + 1000);
    expect(again).toEqual([]);

    const jumpAfterDeath = rooms.applyDinoJumpInput(room, "A", playerA, now + firstOffset + 2000);
    expect(jumpAfterDeath.accepted).toBe(false);
  });

  it("does not finish the run before the 30s deadline", () => {
    const { rooms, room, now } = setupAssemblyRoom();
    const { finished } = rooms.tickDinoRun(room, now + DINO_RUN_DURATION_MS - 1000);
    expect(finished).toEqual([]);
    expect(room.state.teams.A.phase).toBe("ASSEMBLY");
  });
});
