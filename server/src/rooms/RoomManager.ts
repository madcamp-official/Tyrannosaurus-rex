/** Plan.md §17.1~17.4, §21. 방·팀·플레이어의 유일한 진실 소스. Day1 범위: 로비부터 게임 시작까지. */

import { randomUUID } from "node:crypto";
import {
  BONE_IDS,
  CHARGING_DURATION_MS,
  DECORATION_CATALOG,
  DECORATION_VOTE_DURATION_MS,
  EXCAVATION_POINTS_PER_BONE,
  MAX_PLAYERS,
  MAX_PLAYERS_PER_TEAM,
  MIN_PLAYERS,
  NAME_CANDIDATES,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  ROOM_CODE_LENGTH,
  ROOM_CODE_MAX_GENERATION_ATTEMPTS,
  ROUND_DURATION_MS,
  TEAM_IDS,
  type AimUpdateInput,
  type BoneId,
  type CoreZone,
  type DecorationCategory,
  type ExcavateInput,
  type PlayerId,
  type PublicPlayer,
  type RoomCode,
  type RoomState,
  type TeamId,
  type TeamState,
  type Transform2D,
} from "@trex/shared";
import { castVote, pickWinner, tallyVotes } from "../game/voting.js";
import { colorForJoinIndex } from "./colors.js";
import { applyExcavateInput, createExcavationState, makeBoneOrder, type ExcavationRoomState } from "../game/excavation.js";
import {
  claimPiece,
  movePiece,
  placePiece,
  releaseExpiredClaims,
  type PuzzleClaimResult,
  type PuzzleMoveResult,
  type PuzzlePlaceResult,
} from "../game/puzzle.js";
import { applyAimUpdate, type AimState } from "../game/aim.js";
import {
  applyEnergyFire,
  createShotTracking,
  expireChargingIfNeeded,
  expirePurificationIfNeeded,
  type EnergyFireOutcome,
  type ShotTracking,
} from "../game/energy.js";
import { computeActiveCore, computeTrexTransform, type TrexTransform } from "../game/charging.js";

export type CreateRoomResult = { room: RoomRecord; joinUrl: string };
export type JoinRoomError = "ROOM_NOT_FOUND" | "ROOM_ALREADY_STARTED" | "ROOM_FULL" | "NICKNAME_INVALID" | "NICKNAME_TAKEN";
export type StartGameError = "ROOM_NOT_FOUND" | "WRONG_ROOM_PHASE" | "NOT_ENOUGH_PLAYERS" | "NOT_ALL_READY";

export type PhaseDurations = { excavationMs: number | null; assemblyMs: number | null; chargingMs: number | null };

export type ChargingTickUpdate = {
  teamId: TeamId;
  transform: TrexTransform;
  core: CoreZone;
  nextChangeAt: number;
  coreChanged: boolean;
  transition: "TO_PURIFICATION" | "TO_REVIVED_ZOMBIE" | null;
};

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
  /** puzzle:move 속도 제한 계산용 마지막 이동 시각 (boneId별). */
  puzzleLastMoveAt: Record<TeamId, Map<BoneId, number>>;
  /** 플레이어별 최신 유효 조준 좌표 (§17.9). */
  aimState: Map<PlayerId, AimState>;
  /** 플레이어별 발사 쿨다운·shotId 중복 방지 상태 (§17.10). */
  shotTracking: Map<PlayerId, ShotTracking>;
  /** §7 티꾸 투표. 팀·카테고리별 플레이어 투표와 확정 선택. */
  decorationVotes: Record<TeamId, Record<DecorationCategory, Map<PlayerId, string>>>;
  decorationSelections: Record<TeamId, Partial<Record<DecorationCategory, string>>>;
  nameVotes: Record<TeamId, Map<PlayerId, string>>;
  nameSelections: Record<TeamId, string | null>;
  votingEndsAt: number | null;
  votingFinalized: boolean;
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

function makeVoteState(): Pick<
  RoomRecord,
  "decorationVotes" | "decorationSelections" | "nameVotes" | "nameSelections" | "votingEndsAt" | "votingFinalized"
> {
  const emptyDecorationVotes = (): Record<DecorationCategory, Map<PlayerId, string>> => ({
    HAT: new Map(),
    GLASSES: new Map(),
    NECK: new Map(),
    BACKGROUND: new Map(),
  });
  return {
    decorationVotes: { A: emptyDecorationVotes(), B: emptyDecorationVotes() },
    decorationSelections: { A: {}, B: {} },
    nameVotes: { A: new Map(), B: new Map() },
    nameSelections: { A: null, B: null },
    votingEndsAt: null,
    votingFinalized: false,
  };
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
      puzzleLastMoveAt: { A: new Map(), B: new Map() },
      aimState: new Map(),
      shotTracking: new Map(),
      ...makeVoteState(),
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
    room.puzzleLastMoveAt = { A: new Map(), B: new Map() };
    room.aimState = new Map();
    room.shotTracking = new Map();
    Object.assign(room, makeVoteState());
    for (const teamId of TEAM_IDS) {
      resetTeamGameplayState(room.state.teams[teamId], now);
    }
    this.touch(room);
    this.bumpRevision(room);
    return { seed, roundStartedAt: now, roundEndsAt: room.state.roundEndsAt };
  }

  /** §17.14, §21. 팀·닉네임·색상은 유지하고 게임 데이터만 초기화해 로비로 되돌린다. */
  rematchRoom(room: RoomRecord, now: number): void {
    room.state.roomPhase = "LOBBY";
    room.state.roundStartedAt = null;
    room.state.roundEndsAt = null;
    room.state.winner = { teamId: null, reason: null };
    for (const player of room.state.players) {
      player.ready = false;
      player.stats = { excavationInputs: 0, puzzleCorrect: 0, puzzleWrong: 0, shots: 0, hits: 0, coreHits: 0, energyContributed: 0 };
    }
    for (const teamId of TEAM_IDS) {
      resetTeamGameplayState(room.state.teams[teamId], now);
    }
    Object.assign(room, makeVoteState());
    this.touch(room);
    this.bumpRevision(room);
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

  applyPuzzleClaim(room: RoomRecord, teamId: TeamId, playerId: PlayerId, boneId: BoneId, now: number): PuzzleClaimResult {
    const result = claimPiece(room, teamId, playerId, boneId, now);
    if (result.ok) {
      this.touch(room);
      this.bumpRevision(room);
    }
    return result;
  }

  applyPuzzleMove(
    room: RoomRecord,
    teamId: TeamId,
    playerId: PlayerId,
    boneId: BoneId,
    claimToken: string,
    transform: Transform2D,
    now: number,
  ): PuzzleMoveResult {
    const result = movePiece(room, teamId, playerId, boneId, claimToken, transform, now);
    if (result.ok) this.touch(room);
    return result;
  }

  applyPuzzlePlace(
    room: RoomRecord,
    teamId: TeamId,
    playerId: PlayerId,
    boneId: BoneId,
    claimToken: string,
    transform: Transform2D,
    now: number,
  ): PuzzlePlaceResult {
    const result = placePiece(room, teamId, playerId, boneId, claimToken, transform, now);
    if (!result.ok) return result;

    this.touch(room);
    if (result.phaseCompleted) {
      const team = room.state.teams[teamId];
      room.phaseDurations[teamId].assemblyMs = now - team.phaseStartedAt;
      team.phase = "CHARGING";
      team.phaseStartedAt = now;
      team.phaseEndsAt = now + CHARGING_DURATION_MS;
      room.chargingStartedAt[teamId] = now;
    }
    this.bumpRevision(room);
    return result;
  }

  /** 5초 무입력 조작권 만료를 능동적으로 정리한다 (배경 스윕용). */
  releaseExpiredPuzzleClaims(room: RoomRecord, teamId: TeamId, now: number): BoneId[] {
    const released = releaseExpiredClaims(room, teamId, now);
    if (released.length > 0) {
      this.touch(room);
      this.bumpRevision(room);
    }
    return released;
  }

  /** §17.9. CHARGING/PURIFICATION 중에만 조준을 인정한다. 고빈도 이벤트라 revision을 올리지 않는다. */
  applyAim(room: RoomRecord, teamId: TeamId, playerId: PlayerId, input: AimUpdateInput, now: number): boolean {
    const phase = room.state.teams[teamId].phase;
    if (phase !== "CHARGING" && phase !== "PURIFICATION") return false;
    const accepted = applyAimUpdate(room, playerId, input, now);
    if (accepted) this.touch(room);
    return accepted;
  }

  getAimState(room: RoomRecord, playerId: PlayerId): AimState | undefined {
    return room.aimState.get(playerId);
  }

  /** §17.10. 사격 판정 + 정상/좀비 도달 시 라운드 승패까지 확정한다. */
  fireEnergy(
    room: RoomRecord,
    teamId: TeamId,
    playerId: PlayerId,
    shotId: string,
    now: number,
  ): EnergyFireOutcome & { roundFinalized: boolean } {
    const outcome = applyEnergyFire(room, teamId, playerId, shotId, now);
    if (!outcome.accepted) return { ...outcome, roundFinalized: false };

    this.touch(room);
    let roundFinalized = false;
    if (outcome.justReachedRevived) {
      room.phaseDurations[teamId].chargingMs = room.chargingStartedAt[teamId] !== null ? now - room.chargingStartedAt[teamId]! : null;
      roundFinalized = this.checkRoundCompletion(room, now);
    }
    this.bumpRevision(room);
    return { ...outcome, roundFinalized };
  }

  /** 배경 틱(§6.3 10Hz)에서 팀별 티라노 위치·코어 로테이션·시간 초과를 처리한다. */
  tickCharging(room: RoomRecord, now: number): { updates: ChargingTickUpdate[]; roundFinalized: boolean } {
    const updates: ChargingTickUpdate[] = [];
    let roundFinalized = false;

    for (const teamId of TEAM_IDS) {
      const team = room.state.teams[teamId];
      if (team.phase !== "CHARGING" && team.phase !== "PURIFICATION") continue;

      const chargingTransition = expireChargingIfNeeded(room, teamId, now);
      const purificationTransition = expirePurificationIfNeeded(room, teamId, now);
      const transition = chargingTransition ?? purificationTransition;

      const transform = computeTrexTransform(room, teamId, now);
      const { core, nextChangeAt } = computeActiveCore(room, teamId, now);
      const coreChanged = team.charging.activeCore !== core;
      if (coreChanged) {
        team.charging.activeCore = core;
        team.charging.coreChangesAt = nextChangeAt;
      }

      updates.push({ teamId, transform, core, nextChangeAt, coreChanged, transition });

      if (transition) {
        this.touch(room);
        this.bumpRevision(room);
        if (transition === "TO_REVIVED_ZOMBIE") {
          room.phaseDurations[teamId].chargingMs = room.chargingStartedAt[teamId] !== null ? now - room.chargingStartedAt[teamId]! : null;
          if (this.checkRoundCompletion(room, now)) roundFinalized = true;
        }
      }
    }
    return { updates, roundFinalized };
  }

  private teamProgressScore(team: TeamState): number {
    switch (team.phase) {
      case "EXCAVATION":
        return 0 + team.excavation.discoveredBoneIds.length / BONE_IDS.length;
      case "ASSEMBLY":
        return 1 + team.puzzle.fixedCount / Math.max(1, team.puzzle.pieces.length);
      case "CHARGING":
        return 2 + team.charging.energy / 100;
      case "PURIFICATION":
        return 2.5 + team.charging.stability / 100;
      case "REVIVED":
        return 3 + (team.charging.form === "NORMAL" ? 1 : 0.5);
      default:
        return 0;
    }
  }

  /** 정상 부활, 양 팀 모두 좀비로 종료, 라운드 시간 초과 중 하나라도 해당되면 승패를 확정한다. */
  checkRoundCompletion(room: RoomRecord, now: number): boolean {
    if (room.state.roomPhase !== "PLAYING") return false;

    for (const teamId of TEAM_IDS) {
      const team = room.state.teams[teamId];
      if (team.phase === "REVIVED" && team.charging.form === "NORMAL") {
        this.finalizeRoundWinner(room, teamId, "NORMAL_REVIVAL");
        return true;
      }
    }

    const bothRevived = TEAM_IDS.every((teamId) => room.state.teams[teamId].phase === "REVIVED");
    if (bothRevived) {
      // 여기 도달했다는 것은 둘 다 정상(NORMAL)이 아니라 좀비로 끝났다는 뜻이다 (정상은 위에서 즉시 처리됨).
      this.finalizeRoundWinner(room, null, "DRAW");
      return true;
    }

    if (room.state.roundEndsAt !== null && now >= room.state.roundEndsAt) {
      const scoreA = this.teamProgressScore(room.state.teams.A);
      const scoreB = this.teamProgressScore(room.state.teams.B);
      if (scoreA === scoreB) {
        this.finalizeRoundWinner(room, null, "DRAW");
      } else {
        this.finalizeRoundWinner(room, scoreA > scoreB ? "A" : "B", "TIME_LIMIT");
      }
      return true;
    }
    return false;
  }

  private finalizeRoundWinner(room: RoomRecord, teamId: TeamId | null, reason: NonNullable<RoomState["winner"]["reason"]>): void {
    room.state.roomPhase = "RESULT";
    room.state.winner = { teamId, reason };
    // §7 "결과 화면에서 20초 동안 진행한다": 결과 확정과 동시에 티꾸 투표 창을 연다.
    room.state.roomPhase = "DECORATION";
    room.votingEndsAt = Date.now() + DECORATION_VOTE_DURATION_MS;
    this.touch(room);
    this.bumpRevision(room);
  }

  castDecorationVote(room: RoomRecord, teamId: TeamId, playerId: PlayerId, category: DecorationCategory, itemId: string): boolean {
    if (room.state.roomPhase !== "DECORATION" || room.votingFinalized) return false;
    const allowed = DECORATION_CATALOG[category].map((item) => item.id);
    const ok = castVote(room.decorationVotes[teamId][category], playerId, itemId, allowed);
    if (ok) this.touch(room);
    return ok;
  }

  tallyDecorationVote(room: RoomRecord, teamId: TeamId, category: DecorationCategory) {
    return tallyVotes(room.decorationVotes[teamId][category]);
  }

  castNameVote(room: RoomRecord, teamId: TeamId, playerId: PlayerId, candidateId: string): boolean {
    if (room.state.roomPhase !== "DECORATION" || room.votingFinalized) return false;
    const allowed = NAME_CANDIDATES.map((c) => c.id);
    const ok = castVote(room.nameVotes[teamId], playerId, candidateId, allowed);
    if (ok) this.touch(room);
    return ok;
  }

  tallyNameVote(room: RoomRecord, teamId: TeamId) {
    return tallyVotes(room.nameVotes[teamId]);
  }

  /** 투표 마감 시각이 지나면 팀별 카테고리·이름 선택을 확정한다. 두 번 실행되지 않는다. */
  finalizeVotingIfDue(room: RoomRecord, now: number): boolean {
    if (room.state.roomPhase !== "DECORATION" || room.votingFinalized) return false;
    if (room.votingEndsAt === null || now < room.votingEndsAt) return false;

    let randomCursor = 0;
    for (const teamId of TEAM_IDS) {
      const categories = Object.keys(DECORATION_CATALOG) as DecorationCategory[];
      for (const category of categories) {
        const counts = tallyVotes(room.decorationVotes[teamId][category]);
        const allowed = DECORATION_CATALOG[category].map((item) => item.id);
        const winner = pickWinner(counts, allowed, randomCursor);
        randomCursor += 1;
        if (winner) room.decorationSelections[teamId][category] = winner;
      }
      const nameCounts = tallyVotes(room.nameVotes[teamId]);
      const nameAllowed = NAME_CANDIDATES.map((c) => c.id);
      room.nameSelections[teamId] = pickWinner(nameCounts, nameAllowed, randomCursor);
      randomCursor += 1;
    }

    room.votingFinalized = true;
    this.touch(room);
    this.bumpRevision(room);
    return true;
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

  listRoomCodes(): RoomCode[] {
    return Array.from(this.rooms.keys());
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
