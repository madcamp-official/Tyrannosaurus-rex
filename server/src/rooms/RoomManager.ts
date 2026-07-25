/** Plan.md §17.1~17.4, §21. 방·팀·플레이어의 유일한 진실 소스. Day1 범위: 로비부터 게임 시작까지. */

import { randomUUID } from "node:crypto";
import {
  BONE_IDS,
  EXCAVATION_POINTS_PER_BONE,
  MAX_PLAYERS,
  MAX_PLAYERS_PER_TEAM,
  MIN_PLAYERS,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  ROOM_CODE_LENGTH,
  ROOM_CODE_MAX_GENERATION_ATTEMPTS,
  ROUND_DURATION_MS,
  TEAM_IDS,
  type BoneId,
  type ExcavateInput,
  type PlayerId,
  type PublicPlayer,
  type RoomCode,
  type RoomState,
  type TeamId,
  type TeamState,
} from "@trex/shared";
import { colorForJoinIndex } from "./colors.js";
import { applyExcavateInput, createExcavationState, makeBoneOrder, type ExcavationRoomState } from "../game/excavation.js";

export type CreateRoomResult = { room: RoomRecord; joinUrl: string };
export type JoinRoomError = "ROOM_NOT_FOUND" | "ROOM_ALREADY_STARTED" | "ROOM_FULL" | "NICKNAME_INVALID" | "NICKNAME_TAKEN";
export type StartGameError = "ROOM_NOT_FOUND" | "WRONG_ROOM_PHASE" | "NOT_ENOUGH_PLAYERS" | "NOT_ALL_READY";

export type PhaseDurations = { excavationMs: number | null; assemblyMs: number | null; chargingMs: number | null };

export type RoomRecord = {
  state: RoomState;
  hostSocketId: string | null;
  playerSocketIds: Map<PlayerId, string>;
  nextTeamForOddAssignment: TeamId;
  lastActivityAt: number;
  /** 라운드 시작 시 생성되는 결정론적 시드. 발굴 이벤트·뼈 순서·티라노 이동 패턴에 공유된다 (§6.1, §6.3). */
  roundSeed: string | null;
  boneOrder: BoneId[];
  excavation: ExcavationRoomState;
  phaseDurations: Record<TeamId, PhaseDurations>;
  /** CHARGING에 처음 진입한 시각. PURIFICATION을 거쳐도 리셋하지 않아 chargingMs 계산에 쓴다. */
  chargingStartedAt: Record<TeamId, number | null>;
};

/** 게임 시작·재경기 때마다 팀별 발굴·퍼즐·충전 상태를 초기값으로 되돌린다. id/playerIds는 건드리지 않는다. */
function resetTeamGameplayState(team: TeamState, now: number): void {
  team.phase = "EXCAVATION";
  team.phaseStartedAt = now;
  team.phaseEndsAt = null;
  team.excavation = {
    points: 0,
    nextBoneAt: EXCAVATION_POINTS_PER_BONE,
    discoveredBoneIds: [],
    fossils: 0,
    efficiencyMultiplier: 1,
    debuffEndsAt: null,
  };
  team.puzzle = {
    pieces: BONE_IDS.map((boneId) => ({
      boneId,
      discovered: false,
      fixed: false,
      transform: { x: 0.5, y: 0.5, rotationDeg: 0 },
      claimedBy: null,
      claimToken: null,
      claimExpiresAt: null,
      lockedUntil: null,
    })),
    fixedCount: 0,
    completedAt: null,
  };
  team.charging = {
    energy: 0,
    stability: 100,
    activeCore: "HEART",
    coreChangesAt: 0,
    form: "NONE",
    purificationEndsAt: null,
  };
}

function makeEmptyTeamState(teamId: TeamId, now: number): TeamState {
  const team: TeamState = {
    id: teamId,
    phase: "EXCAVATION",
    phaseStartedAt: now,
    phaseEndsAt: null,
    playerIds: [],
    excavation: { points: 0, nextBoneAt: EXCAVATION_POINTS_PER_BONE, discoveredBoneIds: [], fossils: 0, efficiencyMultiplier: 1, debuffEndsAt: null },
    puzzle: { pieces: [], fixedCount: 0, completedAt: null },
    charging: { energy: 0, stability: 100, activeCore: "HEART", coreChangesAt: 0, form: "NONE", purificationEndsAt: null },
  };
  resetTeamGameplayState(team, now);
  return team;
}

function isNicknameSafe(nickname: string): boolean {
  if (nickname.includes("<") || nickname.includes(">")) return false;
  for (let i = 0; i < nickname.length; i += 1) {
    const code = nickname.charCodeAt(i);
    const isControlCharacter = code <= 31 || code === 127;
    if (isControlCharacter) return false;
  }
  return true;
}

export class RoomManager {
  private readonly rooms = new Map<RoomCode, RoomRecord>();

  constructor(private readonly publicJoinOrigin: string) {}

  private generateRoomCode(): RoomCode | null {
    for (let attempt = 0; attempt < ROOM_CODE_MAX_GENERATION_ATTEMPTS; attempt += 1) {
      const code = Math.floor(Math.random() * 10 ** ROOM_CODE_LENGTH)
        .toString()
        .padStart(ROOM_CODE_LENGTH, "0");
      if (!this.rooms.has(code)) return code;
    }
    return null;
  }

  findRoomByHostSocket(socketId: string): RoomRecord | undefined {
    for (const room of this.rooms.values()) {
      if (room.hostSocketId === socketId) return room;
    }
    return undefined;
  }

  findRoomByPlayerSocket(socketId: string): { room: RoomRecord; playerId: PlayerId } | undefined {
    for (const room of this.rooms.values()) {
      for (const [playerId, sid] of room.playerSocketIds.entries()) {
        if (sid === socketId) return { room, playerId };
      }
    }
    return undefined;
  }

  getRoom(roomCode: RoomCode): RoomRecord | undefined {
    return this.rooms.get(roomCode);
  }

  createRoom(hostSocketId: string): CreateRoomResult | null {
    const existing = this.findRoomByHostSocket(hostSocketId);
    if (existing) return { room: existing, joinUrl: this.joinUrlFor(existing.state.roomCode) };

    const roomCode = this.generateRoomCode();
    if (!roomCode) return null;

    const now = Date.now();
    const state: RoomState = {
      schemaVersion: 1,
      revision: 1,
      roomCode,
      roomPhase: "LOBBY",
      createdAt: now,
      roundStartedAt: null,
      roundEndsAt: null,
      hostConnected: true,
      players: [],
      teams: {
        A: makeEmptyTeamState("A", now),
        B: makeEmptyTeamState("B", now),
      },
      winner: { teamId: null, reason: null },
    };

    const room: RoomRecord = {
      state,
      hostSocketId,
      playerSocketIds: new Map(),
      nextTeamForOddAssignment: "A",
      lastActivityAt: now,
      roundSeed: null,
      boneOrder: [],
      excavation: createExcavationState(now),
      phaseDurations: {
        A: { excavationMs: null, assemblyMs: null, chargingMs: null },
        B: { excavationMs: null, assemblyMs: null, chargingMs: null },
      },
      chargingStartedAt: { A: null, B: null },
    };
    this.rooms.set(roomCode, room);
    return { room, joinUrl: this.joinUrlFor(roomCode) };
  }

  private joinUrlFor(roomCode: RoomCode): string {
    return new URL(`/join/${roomCode}`, this.publicJoinOrigin).toString();
  }

  private assignTeam(room: RoomRecord): TeamId {
    const counts: Record<TeamId, number> = { A: room.state.teams.A.playerIds.length, B: room.state.teams.B.playerIds.length };
    if (counts.A !== counts.B) {
      return counts.A < counts.B ? "A" : "B";
    }
    const assigned = room.nextTeamForOddAssignment;
    room.nextTeamForOddAssignment = assigned === "A" ? "B" : "A";
    return assigned;
  }

  joinRoom(
    roomCode: RoomCode,
    rawNickname: string,
    socketId: string,
  ): { ok: true; playerId: PlayerId; teamId: TeamId; color: string; room: RoomRecord } | { ok: false; error: JoinRoomError } {
    const room = this.rooms.get(roomCode);
    if (!room) return { ok: false, error: "ROOM_NOT_FOUND" };
    if (room.state.roomPhase !== "LOBBY") return { ok: false, error: "ROOM_ALREADY_STARTED" };
    if (room.state.players.length >= MAX_PLAYERS) return { ok: false, error: "ROOM_FULL" };

    const nickname = rawNickname.trim();
    const lengthOk = nickname.length >= NICKNAME_MIN_LENGTH && nickname.length <= NICKNAME_MAX_LENGTH;
    if (!lengthOk || !isNicknameSafe(nickname)) {
      return { ok: false, error: "NICKNAME_INVALID" };
    }
    const normalized = nickname.toLowerCase();
    const taken = room.state.players.some((p) => p.nickname.trim().toLowerCase() === normalized);
    if (taken) return { ok: false, error: "NICKNAME_TAKEN" };

    const teamId = this.assignTeam(room);
    if (room.state.teams[teamId].playerIds.length >= MAX_PLAYERS_PER_TEAM) {
      const other: TeamId = teamId === "A" ? "B" : "A";
      if (room.state.teams[other].playerIds.length >= MAX_PLAYERS_PER_TEAM) {
        return { ok: false, error: "ROOM_FULL" };
      }
    }

    const playerId = randomUUID();
    const color = colorForJoinIndex(room.state.players.length);
    const player: PublicPlayer = {
      id: playerId,
      nickname,
      teamId,
      color,
      connected: true,
      ready: false,
      aimMode: "TOUCHPAD",
      motionPermission: "UNKNOWN",
      orientationPermission: "UNKNOWN",
      stats: {
        excavationInputs: 0,
        puzzleCorrect: 0,
        puzzleWrong: 0,
        shots: 0,
        hits: 0,
        coreHits: 0,
        energyContributed: 0,
      },
    };

    room.state.players.push(player);
    room.state.teams[teamId].playerIds.push(playerId);
    room.playerSocketIds.set(playerId, socketId);
    this.touch(room);
    this.bumpRevision(room);

    return { ok: true, playerId, teamId, color, room };
  }

  setReady(roomCode: RoomCode, playerId: PlayerId, ready: boolean): boolean {
    const room = this.rooms.get(roomCode);
    const player = room?.state.players.find((p) => p.id === playerId);
    if (!room || !player) return false;
    player.ready = ready;
    this.touch(room);
    this.bumpRevision(room);
    return true;
  }

  canStart(room: RoomRecord): StartGameError | null {
    if (room.state.roomPhase !== "LOBBY") return "WRONG_ROOM_PHASE";
    const connected = room.state.players.filter((p) => p.connected);
    if (connected.length < MIN_PLAYERS) return "NOT_ENOUGH_PLAYERS";
    if (!connected.every((p) => p.ready)) return "NOT_ALL_READY";
    return null;
  }

  startGame(room: RoomRecord): { seed: string; roundStartedAt: number; roundEndsAt: number } {
    const now = Date.now();
    const seed = randomUUID();
    room.state.roomPhase = "PLAYING";
    room.state.roundStartedAt = now;
    room.state.roundEndsAt = now + ROUND_DURATION_MS;
    room.state.winner = { teamId: null, reason: null };
    room.roundSeed = seed;
    room.boneOrder = makeBoneOrder(seed);
    room.excavation = createExcavationState(now);
    room.phaseDurations = {
      A: { excavationMs: null, assemblyMs: null, chargingMs: null },
      B: { excavationMs: null, assemblyMs: null, chargingMs: null },
    };
    room.chargingStartedAt = { A: null, B: null };
    for (const teamId of TEAM_IDS) {
      resetTeamGameplayState(room.state.teams[teamId], now);
    }
    this.touch(room);
    this.bumpRevision(room);
    return { seed, roundStartedAt: now, roundEndsAt: room.state.roundEndsAt };
  }

  /** 팀 발굴 판정을 적용하고 phase 전환이 필요하면 함께 처리한다. */
  applyExcavation(room: RoomRecord, teamId: TeamId, playerId: PlayerId, input: ExcavateInput, now: number) {
    const result = applyExcavateInput(room, teamId, playerId, input, now);
    if (!result.accepted) return result;

    this.touch(room);
    if (result.phaseCompleted) {
      const team = room.state.teams[teamId];
      room.phaseDurations[teamId].excavationMs = now - team.phaseStartedAt;
      team.phase = "ASSEMBLY";
      team.phaseStartedAt = now;
      team.phaseEndsAt = null;
    }
    this.bumpRevision(room);
    return result;
  }

  setHostConnected(room: RoomRecord, connected: boolean): void {
    room.state.hostConnected = connected;
    this.touch(room);
    this.bumpRevision(room);
  }

  setPlayerConnected(room: RoomRecord, playerId: PlayerId, connected: boolean): void {
    const player = room.state.players.find((p) => p.id === playerId);
    if (!player) return;
    player.connected = connected;
    this.touch(room);
    this.bumpRevision(room);
  }

  closeRoom(roomCode: RoomCode): void {
    this.rooms.delete(roomCode);
  }

  /** 공개 상태 스냅샷. claimToken은 항상 마스킹한다(§15.2). */
  getPublicState(room: RoomRecord): RoomState {
    return {
      ...room.state,
      teams: {
        A: this.maskTeam(room.state.teams.A),
        B: this.maskTeam(room.state.teams.B),
      },
    };
  }

  private maskTeam(team: TeamState): TeamState {
    return {
      ...team,
      puzzle: {
        ...team.puzzle,
        pieces: team.puzzle.pieces.map((piece) => ({ ...piece, claimToken: null })),
      },
    };
  }

  private touch(room: RoomRecord): void {
    room.lastActivityAt = Date.now();
  }

  private bumpRevision(room: RoomRecord): void {
    room.state.revision += 1;
  }

  /** §22.4 ROOM_IDLE_TTL_MS. 로비에서 오래 방치된 방을 정리한다. */
  sweepIdleRooms(idleTtlMs: number): RoomCode[] {
    const now = Date.now();
    const closed: RoomCode[] = [];
    for (const [code, room] of this.rooms.entries()) {
      if (room.state.roomPhase === "LOBBY" && now - room.lastActivityAt > idleTtlMs) {
        this.rooms.delete(code);
        closed.push(code);
      }
    }
    return closed;
  }
}
