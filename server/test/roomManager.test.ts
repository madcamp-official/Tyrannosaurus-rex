import { describe, expect, it } from "vitest";
import { RoomManager } from "../src/rooms/RoomManager.js";

function makeManager(): RoomManager {
  return new RoomManager("https://trex.example.com");
}

describe("RoomManager", () => {
  it("creates a room owned by the host socket", () => {
    const rooms = makeManager();
    const created = rooms.createRoom("host-socket-1");
    expect(created).not.toBeNull();
    expect(created!.room.state.roomPhase).toBe("LOBBY");
    expect(created!.room.state.roomCode).toMatch(/^[0-9]{4}$/);
  });

  it("balances odd team sizes across A/B", () => {
    const rooms = makeManager();
    const created = rooms.createRoom("host-socket-2")!;
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
    const created = rooms.createRoom("host-socket-3")!;
    const roomCode = created.room.state.roomCode;

    rooms.joinRoom(roomCode, "Rex", "socket-a");
    const dup = rooms.joinRoom(roomCode, " rex ", "socket-b");
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toBe("NICKNAME_TAKEN");
  });

  it("only allows start once every connected player is ready", () => {
    const rooms = makeManager();
    const created = rooms.createRoom("host-socket-5")!;
    const roomCode = created.room.state.roomCode;
    const joinA = rooms.joinRoom(roomCode, "A1", "socket-a1");
    const joinB = rooms.joinRoom(roomCode, "B1", "socket-b1");
    expect(joinA.ok && joinB.ok).toBe(true);

    expect(rooms.canStart(created.room)).toBe("NOT_ALL_READY");

    if (joinA.ok) rooms.setReady(roomCode, joinA.playerId, true);
    if (joinB.ok) rooms.setReady(roomCode, joinB.playerId, true);

    expect(rooms.canStart(created.room)).toBeNull();
  });
});
