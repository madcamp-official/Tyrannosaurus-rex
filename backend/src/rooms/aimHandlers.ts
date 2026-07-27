/** Plan.md §17.9, §18. 조준 좌표는 acknowledgement 없이 최대 30Hz로 들어오고 데스크탑에만 전달된다. */

import { AIM_UPDATE_MAX_HZ, aimUpdateInputSchema } from "@trex/shared";
import type { RoomManager } from "./RoomManager.js";
import type { AppServer, AppSocket } from "./types.js";
import { hostChannel } from "./channels.js";
import { toServerEvent } from "./broadcast.js";
import { TokenBucketLimiter } from "../validation/rateLimit.js";

const aimLimiter = new TokenBucketLimiter(AIM_UPDATE_MAX_HZ, AIM_UPDATE_MAX_HZ);

export function registerAimHandlers(io: AppServer, socket: AppSocket, rooms: RoomManager): void {
  socket.on("aim:update", (input) => {
    if (socket.data.role !== "PLAYER") return;
    const roomCode = socket.data.roomCode;
    const playerId = socket.data.playerId;
    if (!roomCode || !playerId) return;
    if (!aimLimiter.tryConsume(socket.id)) return;

    const parsed = aimUpdateInputSchema.safeParse(input);
    if (!parsed.success) return;

    const room = rooms.getRoom(roomCode);
    const player = room?.state.players.find((p) => p.id === playerId);
    if (!room || !player) return;

    const now = Date.now();
    const accepted = rooms.applyAim(room, player.teamId, playerId, parsed.data, now);
    if (!accepted) return;

    io.to(hostChannel(roomCode)).emit(
      "aim:playerMoved",
      toServerEvent(roomCode, room.state.revision, {
        playerId,
        teamId: player.teamId,
        point: parsed.data.point,
        active: true,
      }),
    );
  });
}
