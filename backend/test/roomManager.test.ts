import { describe, expect, it } from "vitest";
import { RoomManager } from "../src/rooms/RoomManager.js";

function makeManager(): RoomManager {
  return new RoomManager("https://trex.example.com");
}

describe("RoomManager", () => {
  it("creates a room owned by the host socket", () => {
    const rooms = makeManager();
    const created = rooms.createRoom("host-socket-1", "테스트 방", 5);
    expect(created).not.toBeNull();
    expect(created!.room.state.roomPhase).toBe("LOBBY");
    expect(created!.room.state.roomCode).toMatch(/^[0-9]{4}$/);
  });

  it("balances odd team sizes across A/B", () => {
    const rooms = makeManager();
    const created = rooms.createRoom("host-socket-2", "테스트 방", 5)!;
    const roomCode = created.room.state.roomCode;

    const assignments: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const result = rooms.joinRoom(roomCode, `P${i}`, `socket-${i}`);
      expect(result.ok).toBe(true);
      if (result.ok) assignments.push(result.teamId);
    }
    const aCount = assignments.filter((t) => t === "A").length;
    const bCount = assignments.filter((t) => t === "B").length;
    expect(Math.abs(aCount - bCount)).toBeLessThanOrEqual(1);
  });

  it("rejects duplicate nicknames within the same room", () => {
    const rooms = makeManager();
    const created = rooms.createRoom("host-socket-3", "테스트 방", 5)!;
    const roomCode = created.room.state.roomCode;

    rooms.joinRoom(roomCode, "Rex", "socket-a");
    const dup = rooms.joinRoom(roomCode, " rex ", "socket-b");
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toBe("NICKNAME_TAKEN");
  });

  it("only allows start once every connected player is ready", () => {
    const rooms = makeManager();
    const created = rooms.createRoom("host-socket-5", "테스트 방", 5)!;
    const roomCode = created.room.state.roomCode;
    const joinA = rooms.joinRoom(roomCode, "A1", "socket-a1");
    const joinB = rooms.joinRoom(roomCode, "B1", "socket-b1");
    expect(joinA.ok && joinB.ok).toBe(true);

    expect(rooms.canStart(created.room)).toBe("NOT_ALL_READY");

    if (joinA.ok) rooms.setReady(roomCode, joinA.playerId, true);
    if (joinB.ok) rooms.setReady(roomCode, joinB.playerId, true);

    expect(rooms.canStart(created.room)).toBeNull();
  });

  it("transitions LOBBY to PLAYING once every player is ready, matching the socket layer's auto-start check", () => {
    // Plan.md §2.2: 전원 준비 완료 시 자동 시작. registerRoomHandlers의 maybeAutoStart는
    // canStart(room) === null일 때 그대로 startGame(room)을 호출한다 — 여기서 그 계약을 검증한다.
    const rooms = makeManager();
    const created = rooms.createRoom("host-socket-6", "테스트 방", 5)!;
    const roomCode = created.room.state.roomCode;
    const joinA = rooms.joinRoom(roomCode, "A1", "socket-a1");
    const joinB = rooms.joinRoom(roomCode, "B1", "socket-b1");
    expect(joinA.ok && joinB.ok).toBe(true);
    if (joinA.ok) rooms.setReady(roomCode, joinA.playerId, true);
    if (joinB.ok) rooms.setReady(roomCode, joinB.playerId, true);

    expect(created.room.state.roomPhase).toBe("LOBBY");
    expect(rooms.canStart(created.room)).toBeNull();
    rooms.startGame(created.room);
    expect(created.room.state.roomPhase).toBe("PLAYING");
  });

  describe("finalizeIfTeamFullyDisconnected", () => {
    function setUpPlayingRoom(hostSocketId: string) {
      const rooms = makeManager();
      const created = rooms.createRoom(hostSocketId, "테스트 방", 5)!;
      const roomCode = created.room.state.roomCode;
      const joinA = rooms.joinRoom(roomCode, "A1", "socket-a1");
      const joinB = rooms.joinRoom(roomCode, "B1", "socket-b1");
      if (!joinA.ok || !joinB.ok) throw new Error("join failed");
      rooms.setReady(roomCode, joinA.playerId, true);
      rooms.setReady(roomCode, joinB.playerId, true);
      rooms.startGame(created.room);
      return { rooms, room: created.room, playerA: joinA.playerId, playerB: joinB.playerId };
    }

    it("finalizes with the opponent as winner once a whole team disconnects mid-game", () => {
      const { rooms, room, playerA } = setUpPlayingRoom("host-disc-1");
      rooms.setPlayerConnected(room, playerA, false);

      const finalized = rooms.finalizeIfTeamFullyDisconnected(room, "A");
      expect(finalized).toBe(true);
      expect(room.state.roomPhase).toBe("DECORATION");
      expect(room.state.winner).toEqual({ teamId: "B", reason: "OPPONENT_DISCONNECTED" });
    });

    it("does not finalize if at least one teammate is still connected", () => {
      const rooms = makeManager();
      const created = rooms.createRoom("host-disc-2", "테스트 방", 5)!;
      const roomCode = created.room.state.roomCode;
      // assignTeam은 팀 인원을 자동으로 맞추므로, 닉네임이 아니라 실제 배정된 teamId로 팀을 나눠야 한다.
      const joins = [
        rooms.joinRoom(roomCode, "P1", "socket-p1"),
        rooms.joinRoom(roomCode, "P2", "socket-p2"),
        rooms.joinRoom(roomCode, "P3", "socket-p3"),
      ];
      for (const join of joins) {
        if (!join.ok) throw new Error("join failed");
        rooms.setReady(roomCode, join.playerId, true);
      }
      rooms.startGame(created.room);

      const byTeam: Record<string, string[]> = { A: [], B: [] };
      for (const join of joins) {
        if (join.ok) byTeam[join.teamId]!.push(join.playerId);
      }
      const multiPlayerTeam = (Object.keys(byTeam) as Array<"A" | "B">).find((teamId) => byTeam[teamId]!.length >= 2)!;
      const [firstPlayerId] = byTeam[multiPlayerTeam]!;

      rooms.setPlayerConnected(created.room, firstPlayerId!, false);
      const finalized = rooms.finalizeIfTeamFullyDisconnected(created.room, multiPlayerTeam);
      expect(finalized).toBe(false);
      expect(created.room.state.roomPhase).toBe("PLAYING");
    });

    it("does not finalize if the opponent team has no connected players either", () => {
      const { rooms, room, playerA, playerB } = setUpPlayingRoom("host-disc-3");
      rooms.setPlayerConnected(room, playerA, false);
      rooms.setPlayerConnected(room, playerB, false);

      const finalized = rooms.finalizeIfTeamFullyDisconnected(room, "A");
      expect(finalized).toBe(false);
      expect(room.state.roomPhase).toBe("PLAYING");
    });

    it("does not finalize outside the PLAYING phase", () => {
      const { rooms, room, playerA } = setUpPlayingRoom("host-disc-4");
      room.state.roomPhase = "LOBBY";
      rooms.setPlayerConnected(room, playerA, false);

      const finalized = rooms.finalizeIfTeamFullyDisconnected(room, "A");
      expect(finalized).toBe(false);
    });
  });
});
