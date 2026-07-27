/** Plan.md §7, §17.12~17.13, §18. 티꾸/이름 투표 이벤트와 마감 처리. */

import { NAME_CANDIDATES, decorationVoteRequestSchema, nameVoteRequestSchema } from "@trex/shared";
import type { RoomManager } from "./RoomManager.js";
import type { AppServer, AppSocket } from "./types.js";
import { roomChannel } from "./channels.js";
import { toServerEvent } from "./broadcast.js";
import { ackErr, ackOk } from "../validation/ack.js";
import { TokenBucketLimiter } from "../validation/rateLimit.js";

const decorationVoteLimiter = new TokenBucketLimiter(5, 5);
const nameVoteLimiter = new TokenBucketLimiter(5, 5);

function playerTeam(rooms: RoomManager, roomCode: string, playerId: string) {
  const room = rooms.getRoom(roomCode);
  const player = room?.state.players.find((p) => p.id === playerId);
  if (!room || !player) return null;
  return { room, teamId: player.teamId };
}

export function registerVotingHandlers(io: AppServer, socket: AppSocket, rooms: RoomManager): void {
  socket.on("decoration:vote", (req, ack) => {
    if (!decorationVoteLimiter.tryConsume(socket.id)) {
      return ack(ackErr(req?.requestId ?? "unknown", "RATE_LIMITED", "too many decoration:vote attempts", true));
    }
    const parsed = decorationVoteRequestSchema.safeParse(req);
    if (!parsed.success) return ack(ackErr(req?.requestId ?? "unknown", "INVALID_PAYLOAD", parsed.error.message, true));

    const roomCode = socket.data.roomCode;
    const playerId = socket.data.playerId;
    if (socket.data.role !== "PLAYER" || !roomCode || !playerId) {
      return ack(ackErr(parsed.data.requestId, "PLAYER_NOT_JOINED", "join a room first", false));
    }
    const ctx = playerTeam(rooms, roomCode, playerId);
    if (!ctx) return ack(ackErr(parsed.data.requestId, "ROOM_NOT_FOUND", "room no longer exists", false));

    const ok = rooms.castDecorationVote(ctx.room, ctx.teamId, playerId, parsed.data.category, parsed.data.itemId);
    if (!ok) return ack(ackErr(parsed.data.requestId, "WRONG_ROOM_PHASE", "voting is not open", false));

    const counts = rooms.tallyDecorationVote(ctx.room, ctx.teamId, parsed.data.category);
    const votingEndsAt = ctx.room.votingEndsAt ?? Date.now();
    const payload = { teamId: ctx.teamId, category: parsed.data.category, counts, selectedItemId: null, votingEndsAt };
    ack(ackOk(parsed.data.requestId, payload));

    io.to(roomChannel(roomCode)).emit("decoration:voteUpdated", toServerEvent(roomCode, ctx.room.state.revision, payload));
  });

  socket.on("name:vote", (req, ack) => {
    if (!nameVoteLimiter.tryConsume(socket.id)) {
      return ack(ackErr(req?.requestId ?? "unknown", "RATE_LIMITED", "too many name:vote attempts", true));
    }
    const parsed = nameVoteRequestSchema.safeParse(req);
    if (!parsed.success) return ack(ackErr(req?.requestId ?? "unknown", "INVALID_PAYLOAD", parsed.error.message, true));

    const roomCode = socket.data.roomCode;
    const playerId = socket.data.playerId;
    if (socket.data.role !== "PLAYER" || !roomCode || !playerId) {
      return ack(ackErr(parsed.data.requestId, "PLAYER_NOT_JOINED", "join a room first", false));
    }
    const ctx = playerTeam(rooms, roomCode, playerId);
    if (!ctx) return ack(ackErr(parsed.data.requestId, "ROOM_NOT_FOUND", "room no longer exists", false));

    const ok = rooms.castNameVote(ctx.room, ctx.teamId, playerId, parsed.data.candidateId);
    if (!ok) return ack(ackErr(parsed.data.requestId, "WRONG_ROOM_PHASE", "voting is not open", false));

    const counts = rooms.tallyNameVote(ctx.room, ctx.teamId);
    const votingEndsAt = ctx.room.votingEndsAt ?? Date.now();
    const payload = { teamId: ctx.teamId, counts, selectedName: null, votingEndsAt };
    ack(ackOk(parsed.data.requestId, payload));

    io.to(roomChannel(roomCode)).emit("name:voteUpdated", toServerEvent(roomCode, ctx.room.state.revision, payload));
  });
}

/** 배경 틱에서 호출: 투표 마감 시각이 지난 방의 선택을 확정하고 방송한다. */
export function finalizeVotingTick(io: AppServer, rooms: RoomManager, roomCode: string): void {
  const room = rooms.getRoom(roomCode);
  if (!room) return;
  const finalized = rooms.finalizeVotingIfDue(room, Date.now());
  if (!finalized) return;

  const channel = roomChannel(roomCode);
  for (const teamId of ["A", "B"] as const) {
    io.to(channel).emit(
      "decoration:completed",
      toServerEvent(roomCode, room.state.revision, { teamId, selections: room.decorationSelections[teamId] }),
    );

    const selectedId = room.nameSelections[teamId];
    const selectedName = selectedId ? (NAME_CANDIDATES.find((c) => c.id === selectedId)?.label ?? null) : null;
    io.to(channel).emit(
      "name:voteUpdated",
      toServerEvent(roomCode, room.state.revision, {
        teamId,
        counts: rooms.tallyNameVote(room, teamId),
        selectedName,
        votingEndsAt: room.votingEndsAt ?? Date.now(),
      }),
    );
  }
}
