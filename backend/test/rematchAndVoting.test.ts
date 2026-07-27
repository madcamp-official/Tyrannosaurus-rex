import { describe, expect, it } from "vitest";
import { DECORATION_CATALOG, NAME_CANDIDATES } from "@trex/shared";
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

describe("decoration and name voting", () => {
  it("only accepts votes while the room is in DECORATION phase", () => {
    const { rooms, room, playerA } = setupFinishedRoom();
    const rejected = rooms.castDecorationVote(room, "A", playerA, "HAT", DECORATION_CATALOG.HAT[0]!.id);
    expect(rejected).toBe(false);

    room.state.roomPhase = "DECORATION";
    const accepted = rooms.castDecorationVote(room, "A", playerA, "HAT", DECORATION_CATALOG.HAT[0]!.id);
    expect(accepted).toBe(true);
  });

  it("rejects itemIds outside the category catalog", () => {
    const { rooms, room, playerA } = setupFinishedRoom();
    room.state.roomPhase = "DECORATION";
    const ok = rooms.castDecorationVote(room, "A", playerA, "HAT", "NOT_A_REAL_ITEM");
    expect(ok).toBe(false);
  });

  it("finalizes the majority-vote winner per category once the voting window closes", () => {
    const { rooms, room, playerA, playerB } = setupFinishedRoom();
    room.state.roomPhase = "DECORATION";
    room.votingEndsAt = Date.now() + 1000;

    const crownId = DECORATION_CATALOG.HAT[0]!.id;
    rooms.castDecorationVote(room, "A", playerA, "HAT", crownId);
    // playerB is on team B in this fixture; simulate a second A-team voter by reusing playerA's id space
    // (single-player team A here, so majority is trivially playerA's pick).
    void playerB;

    const before = rooms.finalizeVotingIfDue(room, Date.now());
    expect(before).toBe(false); // voting window hasn't closed yet

    const finalized = rooms.finalizeVotingIfDue(room, Date.now() + 2000);
    expect(finalized).toBe(true);
    expect(room.decorationSelections.A.HAT).toBe(crownId);
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
