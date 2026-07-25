/** Plan.md §16.2, §19, §22. Node.js 권위 서버 진입점. */

import { createServer } from "node:http";
import express from "express";
import { Server, type Socket } from "socket.io";
import { API_VERSION, type ClientToServerEvents, type ServerToClientEvents } from "@trex/shared";
import { loadEnv } from "./env.js";
import { RoomManager } from "./rooms/RoomManager.js";
import { registerRoomHandlers } from "./rooms/roomHandlers.js";
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
});

const idleSweepInterval = setInterval(() => {
  rooms.sweepIdleRooms(env.ROOM_IDLE_TTL_MS);
}, 60_000);
idleSweepInterval.unref();

httpServer.listen(env.SERVER_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on :${env.SERVER_PORT} (env=${env.NODE_ENV})`);
});

function shutdown(): void {
  shuttingDown = true;
  clearInterval(idleSweepInterval);
  io.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
