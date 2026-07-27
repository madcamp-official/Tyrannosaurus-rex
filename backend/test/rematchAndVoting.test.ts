import { describe, expect, it } from "vitest";
import { NAME_CANDIDATES } from "@trex/shared";
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

describe("name voting", () => {
  it("only accepts votes while the room is in DECORATION phase", () => {
    const { rooms, room, playerA } = setupFinishedRoom();
    const rejected = rooms.castNameVote(room, "A", playerA, NAME_CANDIDATES[0]!.id);
    expect(rejected).toBe(false);

    room.state.roomPhase = "DECORATION";
    const accepted = rooms.castNameVote(room, "A", playerA, NAME_CANDIDATES[0]!.id);
    expect(accepted).toBe(true);
  });

  it("rejects candidateIds outside the name catalog", () => {
    const { rooms, room, playerA } = setupFinishedRoom();
    room.state.roomPhase = "DECORATION";
    const ok = rooms.castNameVote(room, "A", playerA, "NOT_A_REAL_CANDIDATE");
    expect(ok).toBe(false);
  });

  it("finalizes the majority-vote winner once the voting window closes", () => {
    const { rooms, room, playerA } = setupFinishedRoom();
    room.state.roomPhase = "DECORATION";
    room.votingEndsAt = Date.now() + 1000;

    const candidateId = NAME_CANDIDATES[0]!.id;
    rooms.castNameVote(room, "A", playerA, candidateId);

    const before = rooms.finalizeVotingIfDue(room, Date.now());
    expect(before).toBe(false); // voting window hasn't closed yet

    const finalized = rooms.finalizeVotingIfDue(room, Date.now() + 2000);
    expect(finalized).toBe(true);
    expect(room.nameSelections.A).toBe(candidateId);
    expect(room.votingFinalized).toBe(true);

    // A second finalize call must be a no-op.
    const again = rooms.finalizeVotingIfDue(room, Date.now() + 3000);
    expect(again).toBe(false);
  });

  it("picks a random candidate for a team that cast no name votes", () => {
    const { rooms, room } = setupFinishedRoom();
    room.state.roomPhase = "DECORATION";
    room.votingEndsAt = Date.now() - 1;

    rooms.finalizeVotingIfDue(room, Date.now());
    expect(room.nameSelections.A).not.toBeNull();
    expect(NAME_CANDIDATES.map((c) => c.id)).toContain(room.nameSelections.A);
  });
});
