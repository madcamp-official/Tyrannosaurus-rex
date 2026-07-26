/** Plan.md §10.5, §24. 실기기 없이 다중 소켓 로비 흐름을 검증하는 시뮬레이션 클라이언트. */

import { io, type Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import type { ClientToServerEvents, RoomState, ServerToClientEvents } from "@trex/shared";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function parsePlayersArg(argv: string[]): number {
  const index = argv.indexOf("--players");
  if (index === -1) return 4;
  const value = Number.parseInt(argv[index + 1] ?? "", 10);
  return Number.isFinite(value) && value >= 2 && value <= 10 ? value : 4;
}

function connect(origin: string, role: "HOST" | "PLAYER"): AppSocket {
  return io(origin, { auth: { role, clientVersion: "1.0.0" } });
}

async function waitForConnect(socket: AppSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", (err) => reject(err));
  });
}

async function main(): Promise<void> {
  const origin = process.env.SIMULATE_ORIGIN ?? "http://localhost:3001";
  const playerCount = parsePlayersArg(process.argv.slice(2));

  const host = connect(origin, "HOST");
  await waitForConnect(host);

  const createAck = await new Promise<any>((resolve) =>
    host.emit("room:create", { requestId: randomUUID(), settings: { maxPlayers: 10, roundDurationSec: 300, language: "ko" } }, resolve),
  );
  if (!createAck.ok) throw new Error(`room:create failed: ${createAck.error.code}`);
  const roomCode: string = createAck.data.roomCode;
  console.log(`[simulate] room ${roomCode} created`);

  const players: AppSocket[] = [];
  for (let i = 0; i < playerCount; i += 1) {
    const socket = connect(origin, "PLAYER");
    await waitForConnect(socket);
    const joinAck = await new Promise<any>((resolve) =>
      socket.emit("room:join", { requestId: randomUUID(), roomCode, nickname: `P${i + 1}` }, resolve),
    );
    if (!joinAck.ok) throw new Error(`room:join failed for player ${i}: ${joinAck.error.code}`);
    players.push(socket);
    console.log(`[simulate] player ${i + 1} joined team ${joinAck.data.teamId}`);

    const readyAck = await new Promise<any>((resolve) =>
      socket.emit("player:setReady", { requestId: randomUUID(), ready: true }, resolve),
    );
    if (!readyAck.ok) throw new Error(`player:setReady failed for player ${i}: ${readyAck.error.code}`);
  }

  const startAck = await new Promise<any>((resolve) => host.emit("game:start", { requestId: randomUUID() }, resolve));
  if (!startAck.ok) throw new Error(`game:start failed: ${startAck.error.code}`);
  const finalState: RoomState = startAck.data.state;
  console.log(`[simulate] game started, roomPhase=${finalState.roomPhase}, teamA=${finalState.teams.A.playerIds.length}, teamB=${finalState.teams.B.playerIds.length}`);

  for (const socket of [host, ...players]) socket.close();
  console.log("[simulate] ok");
}

main().catch((err) => {
  console.error("[simulate] failed:", err);
  process.exit(1);
});
