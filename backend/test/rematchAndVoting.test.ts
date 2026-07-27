import { describe, expect, it } from "vitest";
import { RoomManager } from "../src/rooms/RoomManager.js";

function setupFinishedRoom() {
  const rooms = new RoomManager("https://trex.example.com");
  const created = rooms.createRoom("host-1", "테스트 방", 5)!;
  const roomCode = created.room.state.roomCode;
  const a = rooms.joinRoom(roomCode, "A1", "socket-a1");
  const b = rooms.joinRoom(roomCode, "B1", "socket-b1");
  if (!a.ok || !b.ok) throw new Error("join failed");
  rooms.setReady(roomCode, a.playerId, true);
  rooms.setReady(roomCode, b.playerId, true);
  rooms.startGame(created.room);
  return { rooms, room: created.room, playerA: a.playerId, playerB: b.playerId };
}

describe("game:rematch", () => {
  it("resets game data to LOBBY while keeping players, teams, and colors", () => {
    const { rooms, room, playerA } = setupFinishedRoom();
    const originalColor = room.state.players.find((p) => p.id === playerA)!.color;
    const originalTeam = room.state.players.find((p) => p.id === playerA)!.teamId;

    room.state.teams.A.excavation.points = 42;
    room.state.players.find((p) => p.id === playerA)!.stats.shots = 5;

    rooms.rematchRoom(room, Date.now());

    expect(room.state.roomPhase).toBe("LOBBY");
    expect(room.state.winner).toEqual({ teamId: null, reason: null });
    expect(room.state.teams.A.excavation.points).toBe(0);
    const player = room.state.players.find((p) => p.id === playerA)!;
    expect(player.stats.shots).toBe(0);
    expect(player.color).toBe(originalColor);
    expect(player.teamId).toBe(originalTeam);
    expect(player.ready).toBe(false);
  });
});

describe("result screen wait window", () => {
  it("does not finalize before the room enters DECORATION phase", () => {
    const { rooms, room } = setupFinishedRoom();
    room.votingEndsAt = Date.now() - 1;
    const finalized = rooms.finalizeVotingIfDue(room, Date.now());
    expect(finalized).toBe(false);
  });

  it("does not finalize before the wait window elapses", () => {
    const { rooms, room } = setupFinishedRoom();
    room.state.roomPhase = "DECORATION";
    room.votingEndsAt = Date.now() + 1000;

    const before = rooms.finalizeVotingIfDue(room, Date.now());
    expect(before).toBe(false);
  });

  it("finalizes exactly once after the wait window elapses", () => {
    const { rooms, room } = setupFinishedRoom();
    room.state.roomPhase = "DECORATION";
    room.votingEndsAt = Date.now() - 1;

    const finalized = rooms.finalizeVotingIfDue(room, Date.now());
    expect(finalized).toBe(true);
    expect(room.votingFinalized).toBe(true);

    // A second finalize call must be a no-op.
    const again = rooms.finalizeVotingIfDue(room, Date.now() + 1000);
    expect(again).toBe(false);
  });
});
