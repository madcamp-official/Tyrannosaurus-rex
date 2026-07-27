/** Plan.md §16.2, §19, §22. Node.js 권위 서버 진입점. */

import { createServer } from "node:http";
import express from "express";
import { Server, type Socket } from "socket.io";
import { API_VERSION, MUSEUM_MAX_ENTRIES, type ClientToServerEvents, type ServerToClientEvents } from "@trex/shared";
import { loadEnv } from "./env.js";
import { listMuseumEntries } from "./db/museumDb.js";
import { RoomManager } from "./rooms/RoomManager.js";
import { registerRoomHandlers } from "./rooms/roomHandlers.js";
import { registerExcavationHandlers, tickExcavationHandoff } from "./rooms/excavationHandlers.js";
import { registerDinoHandlers, tickRoomDinoRun, tickDinoRunHandoff } from "./rooms/dinoHandlers.js";
import { registerAimHandlers } from "./rooms/aimHandlers.js";
import { registerEnergyHandlers, tickRoomCharging } from "./rooms/energyHandlers.js";
import { finalizeVotingTick } from "./rooms/votingHandlers.js";
import type { InterServerEvents, SocketData } from "./rooms/socketData.js";

const env = loadEnv();
const startedAt = Date.now();
let shuttingDown = false;

const app = express();
app.disable("x-powered-by");

app.get("/api/health", (_req, res) => {
  res.status(shuttingDown ? 503 : 200).json({
    status: shuttingDown ? "shutting_down" : "ok",
    time: Date.now(),
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
  });
});

app.get("/api/ready", (_req, res) => {
  const ready = !shuttingDown;
  res.status(ready ? 200 : 503).json({
    ready,
    checks: { socket: "ok", config: "ok" },
  });
});

app.get("/api/version", (_req, res) => {
  res.status(200).json({
    appVersion: env.APP_VERSION,
    apiVersion: API_VERSION,
    gitCommit: process.env.GIT_COMMIT ?? "unknown",
    godotAssetVersion: env.GODOT_ASSET_VERSION,
  });
});

// Plan.md §8 티라노박물관. DB가 유일한 소스 — 최근 MUSEUM_MAX_ENTRIES개만 최신순으로 내려준다.
app.get("/api/museum", (_req, res) => {
  res.status(200).json({ entries: listMuseumEntries(MUSEUM_MAX_ENTRIES) });
});

// autoplay 봇이 방 코드를 손으로 옮겨 적지 않고 열린 로비를 찾을 수 있게 한다.
// 방 코드는 어차피 4자리라 보안 경계가 아니지만, production에서는 노출하지 않는다.
app.get("/api/debug/rooms", (_req, res) => {
  if (env.NODE_ENV === "production") {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Endpoint not found" } });
  }
  const roomList = rooms.listRoomCodes().map((code) => {
    const room = rooms.getRoom(code)!;
    return {
      code,
      roomPhase: room.state.roomPhase,
      hostConnected: room.state.hostConnected,
      playerCount: room.state.players.length,
      createdAt: room.state.createdAt,
    };
  });
  res.status(200).json({ rooms: roomList });
});

app.use((req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Endpoint not found", requestId: req.headers["x-request-id"] ?? "unknown" },
  });
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
  cors: { origin: env.CLIENT_ORIGIN },
});

function clientMajorVersion(version: string): number {
  const [major] = version.split(".");
  return Number.parseInt(major ?? "", 10);
}

const SERVER_MAJOR_VERSION = clientMajorVersion(env.APP_VERSION);

io.use((socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>, next) => {
  const auth = socket.handshake.auth as Partial<SocketData> | undefined;
  const role = auth?.role;
  const clientVersion = auth?.clientVersion;

  if ((role !== "HOST" && role !== "PLAYER") || typeof clientVersion !== "string") {
    return next(Object.assign(new Error("invalid handshake"), { data: { code: "INVALID_PAYLOAD" } }));
  }
  const major = clientMajorVersion(clientVersion);
  if (Number.isNaN(major) || major !== SERVER_MAJOR_VERSION) {
    return next(Object.assign(new Error("unsupported client version"), { data: { code: "CLIENT_VERSION_UNSUPPORTED" } }));
  }

  socket.data.role = role;
  socket.data.clientVersion = clientVersion;
  next();
});

const rooms = new RoomManager(env.PUBLIC_JOIN_ORIGIN);

io.on("connection", (socket) => {
  registerRoomHandlers(io, socket, rooms);
  registerExcavationHandlers(io, socket, rooms);
  registerDinoHandlers(io, socket, rooms);
  registerAimHandlers(io, socket, rooms);
  registerEnergyHandlers(io, socket, rooms);
});

const idleSweepInterval = setInterval(() => {
  rooms.sweepIdleRooms(env.ROOM_IDLE_TTL_MS);
}, 60_000);
idleSweepInterval.unref();

const chargingTickInterval = setInterval(() => {
  for (const roomCode of rooms.listRoomCodes()) {
    tickExcavationHandoff(io, rooms, roomCode);
    tickRoomDinoRun(io, rooms, roomCode);
    tickDinoRunHandoff(io, rooms, roomCode);
    tickRoomCharging(io, rooms, roomCode);
  }
}, 100);
chargingTickInterval.unref();

const votingTickInterval = setInterval(() => {
  for (const roomCode of rooms.listRoomCodes()) finalizeVotingTick(rooms, roomCode);
}, 1_000);
votingTickInterval.unref();

httpServer.listen(env.SERVER_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on :${env.SERVER_PORT} (env=${env.NODE_ENV})`);
});

function shutdown(): void {
  shuttingDown = true;
  clearInterval(idleSweepInterval);
  clearInterval(chargingTickInterval);
  clearInterval(votingTickInterval);
  io.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
