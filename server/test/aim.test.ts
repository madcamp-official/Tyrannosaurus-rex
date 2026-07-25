import { describe, expect, it } from "vitest";
import { RoomManager } from "../src/rooms/RoomManager.js";

function setupChargingRoom() {
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
  room.state.teams.A.phase = "CHARGING";
  return { rooms, room, playerA: a.playerId };
}

describe("aim:update", () => {
  it("is rejected outside CHARGING/PURIFICATION", () => {
    const rooms = new RoomManager("https://trex.example.com");
    const created = rooms.createRoom("host-1")!;
    const roomCode = created.room.state.roomCode;
    const a = rooms.joinRoom(roomCode, "A1", "socket-a1");
    const b = rooms.joinRoom(roomCode, "B1", "socket-b1");
    if (!a.ok || !b.ok) throw new Error("join failed");
    rooms.setReady(roomCode, a.playerId, true);
    rooms.setReady(roomCode, b.playerId, true);
    rooms.startGame(created.room); // team stays in EXCAVATION

    const accepted = rooms.applyAim(
      created.room,
      "A",
      a.playerId,
      { seq: 1, point: { x: 0.5, y: 0.5 }, mode: "TOUCHPAD", calibrated: true, clientTime: Date.now() },
      Date.now(),
    );
    expect(accepted).toBe(false);
  });

  it("accepts updates during CHARGING and stores the latest point", () => {
    const { rooms, room, playerA } = setupChargingRoom();
    const now = Date.now();
    const accepted = rooms.applyAim(
      room,
      "A",
      playerA,
      { seq: 1, point: { x: 0.3, y: 0.4 }, mode: "GYRO", calibrated: true, clientTime: now },
      now,
    );
    expect(accepted).toBe(true);
    const state = rooms.getAimState(room, playerA);
    expect(state?.point).toEqual({ x: 0.3, y: 0.4 });
    expect(state?.mode).toBe("GYRO");
  });

  it("also accepts updates during PURIFICATION", () => {
    const { rooms, room, playerA } = setupChargingRoom();
    room.state.teams.A.phase = "PURIFICATION";
    const accepted = rooms.applyAim(
      room,
      "A",
      playerA,
      { seq: 1, point: { x: 0.1, y: 0.1 }, mode: "TOUCHPAD", calibrated: true, clientTime: Date.now() },
      Date.now(),
    );
    expect(accepted).toBe(true);
  });

  it("ignores stale or duplicate seq numbers", () => {
    const { rooms, room, playerA } = setupChargingRoom();
    const now = Date.now();
    rooms.applyAim(room, "A", playerA, { seq: 5, point: { x: 0.2, y: 0.2 }, mode: "TOUCHPAD", calibrated: true, clientTime: now }, now);
    const stale = rooms.applyAim(
      room,
      "A",
      playerA,
      { seq: 5, point: { x: 0.9, y: 0.9 }, mode: "TOUCHPAD", calibrated: true, clientTime: now },
      now + 10,
    );
    expect(stale).toBe(false);
    expect(rooms.getAimState(room, playerA)?.point).toEqual({ x: 0.2, y: 0.2 });
  });
});
