/** Plan.md §17.1~17.4, §21. 방·팀·플레이어의 유일한 진실 소스. Day1 범위: 로비부터 게임 시작까지. */

import { randomUUID } from "node:crypto";
import {
  CHARGING_DRAW_WINDOW_MS,
  CHARGING_PRACTICE_DURATION_MS,
  DINO_RUN_DURATION_MS,
  DECORATION_VOTE_DURATION_MS,
  EXCAVATION_DRAW_WINDOW_MS,
  EXCAVATION_POINTS_PER_BONE,
  GAME_SCORE_MAX,
  METEOR_DODGE_LIVES,
  MIN_PLAYERS,
  PHASE_START_GRACE_MS,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  ROOM_CODE_LENGTH,
  ROOM_CODE_MAX_GENERATION_ATTEMPTS,
  ROUND_DURATION_MS,
  ROUND_TRANSITION_MS,
  SHOOTING_SCORE_ACCURACY_WEIGHT,
  SHOOTING_SCORE_CORE_WEIGHT,
  SHOOTING_SCORE_CORE_HITS_FOR_FULL_MARKS,
  TEAM_DISPLAY_NAMES,
  TEAM_IDS,
  totalGameScore,
  type AimUpdateInput,
  type BoneId,
  type CoreZone,
  type DecorationCategory,
  type DinoPositionInput,
  type ExcavateInput,
  type PlayerId,
  type PublicPlayer,
  type RoomCode,
  type RoomState,
  type TeamId,
  type TeamState,
  type Transform2D,
} from "@trex/shared";
import { colorForJoinIndex } from "./colors.js";
import {
  applyExcavateInput,
  createExcavationState,
  makeBoneOrder,
  type ExcavationApplyResult,
  type ExcavationRoomState,
} from "../game/excavation.js";
import {
  applyDinoPosition,
  finishChargingPracticeIfNeeded,
  finishDinoRunIfNeeded,
  makeSkyObjectSchedule,
  tickSkyCollisions,
  type DinoFinishResult,
  type SkyCollisionEvent,
} from "../game/dinoRun.js";
import { applyAimUpdate, type AimState } from "../game/aim.js";
import {
  applyEnergyFire,
  createShotTracking,
  expireChargingIfNeeded,
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
  transition: "TO_REVIVED_YRANNO" | null;
};

export type RoomRecord = {
  state: RoomState;
  hostSocketId: string | null;
  playerSocketIds: Map<PlayerId, string>;
  reconnectTokens: Map<PlayerId, string>;
  nextTeamForOddAssignment: TeamId;
  lastActivityAt: number;
  /** 라운드 시작 시 생성되는 결정론적 시드. 발굴 이벤트·뼈 순서·티라노 이동 패턴에 공유된다 (§6.1, §6.3). */
  roundSeed: string | null;
  boneOrder: BoneId[];
  excavation: ExcavationRoomState;
  /** 두 팀 다 발굴을 끝내면 이 시각에 함께 다이노런으로 넘어간다 (§ROUND_TRANSITION_MS 대기). */
  excavationTransitionAt: number | null;
  /** 먼저 발굴을 끝낸 팀의 완료 시각. 상대가 EXCAVATION_DRAW_WINDOW_MS 안에 이어서 끝나면 DRAW로 정정한다. */
  excavationFirstFinishAt: number | null;
  /** 두 팀 다 다이노런을 끝내면 이 시각에 함께 CHARGING으로 넘어간다 (§ROUND_TRANSITION_MS 대기). */
  dinoRunTransitionAt: number | null;
  /** 먼저 부활 에너지를 채운 팀의 완료 시각. 상대가 CHARGING_DRAW_WINDOW_MS 안에 이어서 채우면 DRAW로 정정한다. */
  chargingFirstFinishAt: number | null;
  phaseDurations: Record<TeamId, PhaseDurations>;
  /** CHARGING에 처음 진입한 시각. chargingMs 계산에 쓴다. */
  chargingStartedAt: Record<TeamId, number | null>;
  /** 공유 스켈레톤 하나의 이동·코어 로테이션 기준 시각. 두 팀 중 먼저 CHARGING에 들어간 팀이 정한다 (§2.3). */
  sharedTrexStartedAt: number | null;
  /** 양 팀이 동시에 노리는 서버 권위 약점. 유효 약점 명중 직후 다른 부위로 변경된다. */
  sharedActiveCore: CoreZone;
  /** 결정적인 다음 약점 선택에 사용하는 이번 라운드의 누적 약점 명중 횟수. */
  sharedCoreHitCount: number;
  /** 플레이어별 최신 유효 조준 좌표 (§17.9). */
  aimState: Map<PlayerId, AimState>;
  /**
   * 플레이어별 최신 좌우 위치(운석 피하기, 0~1) + 최근 이력. history는 "낙하 순간에 실제로
   * 그 자리에 있었는지"를 나중에(유예 시간 이후) 되짚어 판정하기 위한 것 — 최신값만 쓰면
   * 착지 순간엔 피했다가 유예 시간 안에 다시 그 자리로 걸어 들어온 경우도 "위에서 맞은 것"으로
   * 잘못 판정된다(§SKY_OBJECT_COLLISION_GRACE_MS, dinoRun.ts의 positionNearTime).
   */
  dinoPositionState: Map<PlayerId, { x: number; lastSeq: number; receivedAt: number; history: { x: number; receivedAt: number }[] }>;
  /**
   * 운석이 "공룡을 따라다니다 떨어지도록" — 운석이 스폰되는 순간(낙하 시작 시각) 플레이어가
   * 있던 좌우 위치를 목표로 고정해둔다. 키는 `${playerId}:${objectId}`. 그 뒤로 플레이어가
   * 움직이면 그 목표 지점에서 벗어나 피할 수 있다.
   */
  dinoMeteorLockState: Map<string, number>;
  /** 플레이어별 발사 쿨다운·shotId 중복 방지 상태 (§17.10). */
  shotTracking: Map<PlayerId, ShotTracking>;
  /** 결과 화면에서 박물관 저장까지의 대기 창. 투표 기능은 없고 시간 경과만 확인한다. */
  decorationSelections: Record<TeamId, Partial<Record<DecorationCategory, string>>>;
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
    result: null,
  };
  team.dinoRun = {
    skyObjects: [],
    livesByPlayer: {},
    scoreByPlayer: {},
    resolvedObjectIdsByPlayer: {},
    deadPlayerIds: [],
    performance: null,
    grade: null,
    result: null,
  };
  team.charging = {
    energy: 0,
    stability: 100,
    activeCore: "HEART",
    coreChangesAt: 0,
    form: "NONE",
    result: null,
  };
  team.scores = { excavation: null, dinoRun: null, charging: null };
}

function makeEmptyTeamState(teamId: TeamId, now: number): TeamState {
  const team: TeamState = {
    id: teamId,
    phase: "EXCAVATION",
    phaseStartedAt: now,
    phaseEndsAt: null,
    playerIds: [],
    excavation: { points: 0, nextBoneAt: EXCAVATION_POINTS_PER_BONE, discoveredBoneIds: [], fossils: 0, result: null },
    dinoRun: {
      skyObjects: [],
      livesByPlayer: {},
      scoreByPlayer: {},
      resolvedObjectIdsByPlayer: {},
      deadPlayerIds: [],
      performance: null,
      grade: null,
      result: null,
    },
    charging: { energy: 0, stability: 100, activeCore: "HEART", coreChangesAt: 0, form: "NONE", result: null },
    scores: { excavation: null, dinoRun: null, charging: null },
  };
  resetTeamGameplayState(team, now);
  return team;
}

function makeVoteState(): Pick<RoomRecord, "decorationSelections" | "votingEndsAt" | "votingFinalized"> {
  return {
    decorationSelections: { A: {}, B: {} },
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

  createRoom(
    hostSocketId: string,
    roomName: string,
    maxPlayersPerTeam: number,
    teamNames?: Partial<Record<TeamId, string>>,
  ): CreateRoomResult | null {
    const existing = this.findRoomByHostSocket(hostSocketId);
    if (existing) return { room: existing, joinUrl: this.joinUrlFor(existing.state.roomCode) };

    const roomCode = this.generateRoomCode();
    if (!roomCode) return null;

    const now = Date.now();
    const state: RoomState = {
      schemaVersion: 1,
      revision: 1,
      roomCode,
      roomName,
      maxPlayersPerTeam,
      teamNames: {
        A: teamNames?.A ?? TEAM_DISPLAY_NAMES.A,
        B: teamNames?.B ?? TEAM_DISPLAY_NAMES.B,
      },
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
      reconnectTokens: new Map(),
      nextTeamForOddAssignment: "A",
      lastActivityAt: now,
      roundSeed: null,
      boneOrder: [],
      excavation: createExcavationState(now),
      excavationTransitionAt: null,
      excavationFirstFinishAt: null,
      dinoRunTransitionAt: null,
      chargingFirstFinishAt: null,
      phaseDurations: {
        A: { excavationMs: null, assemblyMs: null, chargingMs: null },
        B: { excavationMs: null, assemblyMs: null, chargingMs: null },
      },
      chargingStartedAt: { A: null, B: null },
      sharedTrexStartedAt: null,
      sharedActiveCore: "HEART",
      sharedCoreHitCount: 0,
      aimState: new Map(),
      dinoPositionState: new Map(),
      dinoMeteorLockState: new Map(),
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
    reconnectToken?: string,
  ):
    | {
        ok: true;
        playerId: PlayerId;
        teamId: TeamId;
        color: string;
        reconnectToken: string;
        reconnected: boolean;
        room: RoomRecord;
      }
    | { ok: false; error: JoinRoomError } {
    const room = this.rooms.get(roomCode);
    if (!room) return { ok: false, error: "ROOM_NOT_FOUND" };

    if (reconnectToken) {
      const normalizedNickname = rawNickname.trim().toLowerCase();
      const existing = room.state.players.find(
        (player) =>
          player.nickname.trim().toLowerCase() === normalizedNickname &&
          room.reconnectTokens.get(player.id) === reconnectToken,
      );
      if (existing) {
        room.playerSocketIds.set(existing.id, socketId);
        existing.connected = true;
        this.touch(room);
        this.bumpRevision(room);
        return {
          ok: true,
          playerId: existing.id,
          teamId: existing.teamId,
          color: existing.color,
          reconnectToken,
          reconnected: true,
          room,
        };
      }
    }

    if (room.state.roomPhase !== "LOBBY") return { ok: false, error: "ROOM_ALREADY_STARTED" };
    if (room.state.players.length >= room.state.maxPlayersPerTeam * 2) return { ok: false, error: "ROOM_FULL" };

    const nickname = rawNickname.trim();
    const lengthOk = nickname.length >= NICKNAME_MIN_LENGTH && nickname.length <= NICKNAME_MAX_LENGTH;
    if (!lengthOk || !isNicknameSafe(nickname)) {
      return { ok: false, error: "NICKNAME_INVALID" };
    }
    const normalized = nickname.toLowerCase();
    const taken = room.state.players.some((p) => p.nickname.trim().toLowerCase() === normalized);
    if (taken) return { ok: false, error: "NICKNAME_TAKEN" };

    const teamId = this.assignTeam(room);
    if (room.state.teams[teamId].playerIds.length >= room.state.maxPlayersPerTeam) {
      const other: TeamId = teamId === "A" ? "B" : "A";
      if (room.state.teams[other].playerIds.length >= room.state.maxPlayersPerTeam) {
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
        dinoCleared: 0,
        shots: 0,
        hits: 0,
        coreHits: 0,
        energyContributed: 0,
      },
    };

    room.state.players.push(player);
    room.state.teams[teamId].playerIds.push(playerId);
    room.playerSocketIds.set(playerId, socketId);
    const issuedReconnectToken = randomUUID();
    room.reconnectTokens.set(playerId, issuedReconnectToken);
    this.touch(room);
    this.bumpRevision(room);

    return {
      ok: true,
      playerId,
      teamId,
      color,
      reconnectToken: issuedReconnectToken,
      reconnected: false,
      room,
    };
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
    room.sharedTrexStartedAt = null;
    room.sharedActiveCore = "HEART";
    room.sharedCoreHitCount = 0;
    room.aimState = new Map();
    room.dinoPositionState = new Map();
    room.dinoMeteorLockState = new Map();
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
      player.stats = { excavationInputs: 0, dinoCleared: 0, shots: 0, hits: 0, coreHits: 0, energyContributed: 0 };
    }
    for (const teamId of TEAM_IDS) {
      resetTeamGameplayState(room.state.teams[teamId], now);
    }
    room.excavationTransitionAt = null;
    room.excavationFirstFinishAt = null;
    room.dinoRunTransitionAt = null;
    room.chargingFirstFinishAt = null;
    room.sharedTrexStartedAt = null;
    room.sharedActiveCore = "HEART";
    room.sharedCoreHitCount = 0;
    Object.assign(room, makeVoteState());
    this.touch(room);
    this.bumpRevision(room);
  }

  /**
   * 팀 발굴 판정을 적용한다. 먼저 끝난 팀은 WIN으로 표시하고 상대를 기다리며, 상대도 끝나면
   * LOSE로 표시하고 ROUND_TRANSITION_MS 뒤 두 팀이 동시에 다이노런으로 넘어가도록 예약한다
   * (실제 전환은 tickExcavationTransition이 처리). 단, 상대가 EXCAVATION_DRAW_WINDOW_MS
   * 안에 이어서 끝나면 거의 동시로 보고 먼저 끝난 팀의 WIN도 함께 DRAW로 정정한다.
   */
  applyExcavation(
    room: RoomRecord,
    teamId: TeamId,
    playerId: PlayerId,
    input: ExcavateInput,
    now: number,
  ): ExcavationApplyResult & { teamResults: Array<{ teamId: TeamId; result: "WIN" | "LOSE" | "DRAW"; score: number }> } {
    const team = room.state.teams[teamId];
    if (now < team.phaseStartedAt + PHASE_START_GRACE_MS) {
      return { accepted: false, pointsAdded: 0, boneAwards: [], event: null, phaseCompleted: false, teamResults: [] };
    }
    const result = applyExcavateInput(room, teamId, playerId, input, now);
    if (!result.accepted) return { ...result, teamResults: [] };

    this.touch(room);
    const teamResults: Array<{ teamId: TeamId; result: "WIN" | "LOSE" | "DRAW"; score: number }> = [];
    if (result.phaseCompleted) {
      const otherTeamId: TeamId = teamId === "A" ? "B" : "A";
      const otherTeam = room.state.teams[otherTeamId];
      room.phaseDurations[teamId].excavationMs = now - team.phaseStartedAt - PHASE_START_GRACE_MS;
      team.scores.excavation = this.computeExcavationScore(room, now);

      if (otherTeam.excavation.result === null) {
        team.excavation.result = "WIN";
        room.excavationFirstFinishAt = now;
      } else if (
        otherTeam.excavation.result === "WIN" &&
        room.excavationFirstFinishAt !== null &&
        now - room.excavationFirstFinishAt <= EXCAVATION_DRAW_WINDOW_MS
      ) {
        team.excavation.result = "DRAW";
        otherTeam.excavation.result = "DRAW";
        teamResults.push({ teamId: otherTeamId, result: "DRAW", score: otherTeam.scores.excavation ?? 0 });
      } else {
        team.excavation.result = "LOSE";
      }

      teamResults.push({ teamId, result: team.excavation.result, score: team.scores.excavation });
      if (otherTeam.excavation.result !== null) {
        room.excavationTransitionAt = now + ROUND_TRANSITION_MS;
      }
    }
    this.bumpRevision(room);
    return { ...result, teamResults };
  }

  /** 두 팀 다 발굴을 끝내고 대기 시간이 지나면, 함께 운석 피하기(ASSEMBLY)로 전환한다. */
  tickExcavationTransition(room: RoomRecord, now: number): boolean {
    if (room.excavationTransitionAt === null || now < room.excavationTransitionAt) return false;

    for (const teamId of TEAM_IDS) {
      const team = room.state.teams[teamId];
      team.excavation.result = null;
      team.phase = "ASSEMBLY";
      team.phaseStartedAt = now;
      team.phaseEndsAt = now + PHASE_START_GRACE_MS + DINO_RUN_DURATION_MS;
      // 낙하 오브젝트 스케줄은 라운드 시드에서 파생되어 양 팀이 항상 동일하다 (§4).
      team.dinoRun.skyObjects = makeSkyObjectSchedule(room.roundSeed ?? room.state.roomCode);
      // 목숨은 항상 풀로, 점수는 항상 0에서 시작해야 한다 — resetTeamGameplayState가 라운드
      // 시작 시 이미 비워두지만, 여기서도 명시적으로 초기화해 두어 어떤 경로로 ASSEMBLY에
      // 들어오든 항상 같은 시작 상태를 보장한다.
      for (const playerId of team.playerIds) {
        team.dinoRun.livesByPlayer[playerId] = METEOR_DODGE_LIVES;
        team.dinoRun.scoreByPlayer[playerId] = 0;
      }
    }
    room.excavationTransitionAt = null;
    this.touch(room);
    this.bumpRevision(room);
    return true;
  }

  /** 경기 1 점수: 라운드 시작 이후 완료까지 걸린 시간이 짧을수록 높다 (§2.3 타임 보너스). */
  private computeExcavationScore(room: RoomRecord, now: number): number {
    const startedAt = (room.state.roundStartedAt ?? now) + PHASE_START_GRACE_MS;
    const elapsedRatio = Math.min(1, Math.max(0, (now - startedAt) / ROUND_DURATION_MS));
    return Math.round(GAME_SCORE_MAX * (1 - elapsedRatio));
  }

  /** §17.6 운석 피하기 좌우 위치. 고빈도라 revision은 올리지 않는다 (판정 결과는 델타 이벤트로 전파). */
  applyDinoPositionInput(room: RoomRecord, teamId: TeamId, playerId: PlayerId, input: DinoPositionInput, now: number): boolean {
    if (now < room.state.teams[teamId].phaseStartedAt + PHASE_START_GRACE_MS) return false;
    const accepted = applyDinoPosition(room, teamId, playerId, input, now);
    if (accepted) this.touch(room);
    return accepted;
  }

  /** 낙하 시각이 지난 오브젝트를 판정한다(운석 명중/보너스 획득/탈락). 팀별 이벤트를 돌려준다. */
  tickDinoCollisions(room: RoomRecord, now: number): Array<{ teamId: TeamId; event: SkyCollisionEvent }> {
    const results: Array<{ teamId: TeamId; event: SkyCollisionEvent }> = [];
    for (const teamId of TEAM_IDS) {
      const events = tickSkyCollisions(room, teamId, now);
      for (const event of events) results.push({ teamId, event });
      if (events.length > 0) this.touch(room);
    }
    return results;
  }

  /**
   * 다이노런 30초 종료를 배경 틱에서 처리한다. 평가가 끝난 팀들을 돌려주고, 두 팀 다
   * 끝나면 클리어율을 비교해 WIN/LOSE/DRAW를 정하고 ROUND_TRANSITION_MS 뒤 함께
   * CHARGING으로 넘어가도록 예약한다 (실제 전환은 tickDinoRunTransition이 처리).
   */
  tickDinoRun(
    room: RoomRecord,
    now: number,
  ): {
    finished: Array<{ teamId: TeamId; result: DinoFinishResult }>;
    teamResults: Array<{ teamId: TeamId; result: "WIN" | "LOSE" | "DRAW"; score: number }>;
  } {
    const finished: Array<{ teamId: TeamId; result: DinoFinishResult }> = [];
    for (const teamId of TEAM_IDS) {
      const result = finishDinoRunIfNeeded(room, teamId, now);
      if (result) {
        // 경기 2 점수: 팀 클리어율을 그대로 점수로 사용한다 (§2.3, §6.2).
        room.state.teams[teamId].scores.dinoRun = Math.round(GAME_SCORE_MAX * result.performance);
        finished.push({ teamId, result });
        this.touch(room);
        this.bumpRevision(room);
      }
    }

    const teamResults: Array<{ teamId: TeamId; result: "WIN" | "LOSE" | "DRAW"; score: number }> = [];
    const teamA = room.state.teams.A;
    const teamB = room.state.teams.B;
    if (
      room.dinoRunTransitionAt === null &&
      teamA.phase === "ASSEMBLY" &&
      teamB.phase === "ASSEMBLY" &&
      teamA.dinoRun.result === null &&
      teamA.dinoRun.performance !== null &&
      teamB.dinoRun.performance !== null
    ) {
      if (teamA.dinoRun.performance > teamB.dinoRun.performance) {
        teamA.dinoRun.result = "WIN";
        teamB.dinoRun.result = "LOSE";
      } else if (teamA.dinoRun.performance < teamB.dinoRun.performance) {
        teamA.dinoRun.result = "LOSE";
        teamB.dinoRun.result = "WIN";
      } else {
        teamA.dinoRun.result = "DRAW";
        teamB.dinoRun.result = "DRAW";
      }
      teamResults.push(
        { teamId: "A", result: teamA.dinoRun.result, score: teamA.scores.dinoRun ?? 0 },
        { teamId: "B", result: teamB.dinoRun.result, score: teamB.scores.dinoRun ?? 0 },
      );
      // 결과 뒤에 이전 3D 화면을 다시 노출하지 않고 다음 틱에서 곧바로 영점 화면으로 간다.
      room.dinoRunTransitionAt = now;
      this.touch(room);
      this.bumpRevision(room);
    }

    return { finished, teamResults };
  }

  /** 두 팀 다 다이노런을 끝내고 대기 시간이 지나면, 함께 CHARGING_PRACTICE(영점 조정 연습)로 전환한다. */
  tickDinoRunTransition(room: RoomRecord, now: number): boolean {
    if (room.dinoRunTransitionAt === null || now < room.dinoRunTransitionAt) return false;

    for (const teamId of TEAM_IDS) {
      const team = room.state.teams[teamId];
      // performance까지 같이 null로 되돌려야 한다 — result만 지우면 finishDinoRunIfNeeded의
      // "이미 평가함" 가드(performance !== null)가 계속 참으로 남아, 바로 다음 틱에 tickDinoRun의
      // WIN/LOSE 비교 블록이 phase 체크 없이 재실행되어 전환이 중복 발생했었다.
      team.dinoRun.result = null;
      team.dinoRun.performance = null;
      team.dinoRun.grade = null;
      team.phase = "CHARGING_PRACTICE";
      team.phaseStartedAt = now;
      team.phaseEndsAt = now + PHASE_START_GRACE_MS + CHARGING_PRACTICE_DURATION_MS;
      // chargingStartedAt/sharedTrexStartedAt은 실제 CHARGING 진입(연습 종료, tickChargingPractice)
      // 시점으로 미룬다.
    }
    room.dinoRunTransitionAt = null;
    this.touch(room);
    this.bumpRevision(room);
    return true;
  }

  /** 15초 영점 조정 연습이 끝난 팀을 실제 CHARGING으로 전환한다. 전환된 팀 목록을 돌려준다. */
  tickChargingPractice(room: RoomRecord, now: number): TeamId[] {
    const finished: TeamId[] = [];
    for (const teamId of TEAM_IDS) {
      if (finishChargingPracticeIfNeeded(room, teamId, now)) {
        finished.push(teamId);
        this.touch(room);
        this.bumpRevision(room);
      }
    }
    return finished;
  }

  /** §17.9. CHARGING과 연습(CHARGING_PRACTICE) 중에만 조준을 인정한다. 고빈도 이벤트라 revision을 올리지 않는다. */
  applyAim(room: RoomRecord, teamId: TeamId, playerId: PlayerId, input: AimUpdateInput, now: number): boolean {
    const team = room.state.teams[teamId];
    const phase = team.phase;
    if (phase !== "CHARGING" && phase !== "CHARGING_PRACTICE") return false;
    if (now < team.phaseStartedAt + PHASE_START_GRACE_MS) return false;
    const accepted = applyAimUpdate(room, playerId, input, now);
    if (accepted) this.touch(room);
    return accepted;
  }

  getAimState(room: RoomRecord, playerId: PlayerId): AimState | undefined {
    return room.aimState.get(playerId);
  }

  /** §17.10. 사격 판정 + 정상/와이라노 도달 시 라운드 승패까지 확정한다. */
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
      this.finalizeChargingScore(room, teamId);
      this.applyChargingResult(room, teamId, now);
      roundFinalized = this.checkRoundCompletion(room, now);
    }
    this.bumpRevision(room);
    return { ...outcome, roundFinalized };
  }

  /** 경기 3 점수: 팀 전체 명중률과 활성 코어 명중 수를 기준으로 매긴다 (§2.3, §6.3). */
  private finalizeChargingScore(room: RoomRecord, teamId: TeamId): void {
    const members = room.state.players.filter((p) => p.teamId === teamId);
    const totalShots = members.reduce((sum, p) => sum + p.stats.shots, 0);
    const totalHits = members.reduce((sum, p) => sum + p.stats.hits, 0);
    const totalCoreHits = members.reduce((sum, p) => sum + p.stats.coreHits, 0);
    const accuracy = totalShots > 0 ? totalHits / totalShots : 0;
    const coreFactor = Math.min(1, totalCoreHits / SHOOTING_SCORE_CORE_HITS_FOR_FULL_MARKS);
    room.state.teams[teamId].scores.charging = Math.round(
      SHOOTING_SCORE_ACCURACY_WEIGHT * accuracy + SHOOTING_SCORE_CORE_WEIGHT * coreFactor,
    );
  }

  /**
   * 발굴과 같은 패턴(§applyExcavation) — 부활 에너지를 먼저 채운(NORMAL) 팀이 WIN, 상대도
   * REVIVED에 도달하면 LOSE. 단 CHARGING_DRAW_WINDOW_MS 안에 이어서 채우면 둘 다 DRAW로
   * 정정한다. 시간 초과로 와이라노(YRANNO)가 되면 순서와 무관하게 항상 LOSE다.
   */
  private applyChargingResult(room: RoomRecord, teamId: TeamId, now: number): void {
    const team = room.state.teams[teamId];
    const otherTeamId: TeamId = teamId === "A" ? "B" : "A";
    const otherTeam = room.state.teams[otherTeamId];

    if (team.charging.form === "NORMAL" && otherTeam.charging.result === null) {
      team.charging.result = "WIN";
      room.chargingFirstFinishAt = now;
    } else if (
      team.charging.form === "NORMAL" &&
      otherTeam.charging.result === "WIN" &&
      room.chargingFirstFinishAt !== null &&
      now - room.chargingFirstFinishAt <= CHARGING_DRAW_WINDOW_MS
    ) {
      team.charging.result = "DRAW";
      otherTeam.charging.result = "DRAW";
    } else {
      team.charging.result = "LOSE";
    }
  }

  /** 배경 틱(§6.3 10Hz)에서 팀별 티라노 위치·코어 로테이션·시간 초과를 처리한다. */
  tickCharging(room: RoomRecord, now: number): { updates: ChargingTickUpdate[]; roundFinalized: boolean } {
    const updates: ChargingTickUpdate[] = [];
    let roundFinalized = false;

    for (const teamId of TEAM_IDS) {
      const team = room.state.teams[teamId];
      const otherTeamId: TeamId = teamId === "A" ? "B" : "A";
      const otherStillCharging = room.state.teams[otherTeamId].phase === "CHARGING";
      const stillCharging = team.phase === "CHARGING";
      // 스켈레톤은 방에 하나뿐인 공유 개체다(§2.3) — 한쪽 팀이 먼저 REVIVED에 도달해도
      // 다른 팀이 아직 CHARGING 중이면 화면엔 계속 같은 자리에서 움직이는 모습을 보여줘야
      // 한다. 안 그러면 먼저 끝난 팀 쪽 화면은 그 순간의 마지막 위치로 트윈이 끝난 채
      // 멈춰버려("공룡이 움직이다가 마는") 부자연스럽다.
      if (!stillCharging && !(team.phase === "REVIVED" && otherStillCharging)) continue;

      const transition = stillCharging ? expireChargingIfNeeded(room, teamId, now) : null;

      const transform = computeTrexTransform(room, now);
      const { core, nextChangeAt } = computeActiveCore(room, now);
      const coreChanged = stillCharging && team.charging.activeCore !== core;
      if (coreChanged) {
        team.charging.activeCore = core;
        team.charging.coreChangesAt = nextChangeAt;
      }

      updates.push({ teamId, transform, core, nextChangeAt, coreChanged, transition });

      if (transition) {
        this.touch(room);
        this.bumpRevision(room);
        if (transition === "TO_REVIVED_YRANNO") {
          room.phaseDurations[teamId].chargingMs = room.chargingStartedAt[teamId] !== null ? now - room.chargingStartedAt[teamId]! : null;
          this.finalizeChargingScore(room, teamId);
          this.applyChargingResult(room, teamId, now);
          if (this.checkRoundCompletion(room, now)) roundFinalized = true;
        }
      }
    }
    return { updates, roundFinalized };
  }

  /**
   * §3 누적 점수제. 경기 단위로 승패를 가리지 않고, 양 팀 모두 REVIVED(정상이든 와이라노든)에
   * 도달했거나 라운드 시간이 끝났을 때만 3경기 누적 점수 총합을 비교해 승자를 확정한다.
   * 부활 판정(정상/와이라노)은 이 비교와 무관한 팀별 개별 상태다 (§2.3 부활 판정).
   */
  checkRoundCompletion(room: RoomRecord, now: number): boolean {
    if (room.state.roomPhase !== "PLAYING") return false;

    const bothRevived = TEAM_IDS.every((teamId) => room.state.teams[teamId].phase === "REVIVED");
    const timedOut = room.state.roundEndsAt !== null && now >= room.state.roundEndsAt;
    if (!bothRevived && !timedOut) return false;

    const totalA = totalGameScore(room.state.teams.A.scores);
    const totalB = totalGameScore(room.state.teams.B.scores);
    if (totalA === totalB) {
      this.finalizeRoundWinner(room, null, "DRAW");
    } else {
      this.finalizeRoundWinner(room, totalA > totalB ? "A" : "B", "SCORE_TOTAL");
    }
    return true;
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

  /** 결과 화면 대기 시각이 지나면 확정한다 (투표 없음). 두 번 실행되지 않는다. */
  finalizeVotingIfDue(room: RoomRecord, now: number): boolean {
    if (room.state.roomPhase !== "DECORATION" || room.votingFinalized) return false;
    if (room.votingEndsAt === null || now < room.votingEndsAt) return false;

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

  /**
   * Plan.md §21: "한 팀의 모든 플레이어가 연결 해제되면 상대 팀의 승리로 종료한다."
   * 게임이 진행 중(PLAYING)일 때만 적용하고, 상대 팀에도 연결된 플레이어가 없으면(둘 다 끊김)
   * 승자를 정할 수 없으니 손대지 않는다.
   */
  finalizeIfTeamFullyDisconnected(room: RoomRecord, teamId: TeamId): boolean {
    if (room.state.roomPhase !== "PLAYING") return false;
    const teamPlayers = room.state.players.filter((p) => p.teamId === teamId);
    if (teamPlayers.length === 0 || teamPlayers.some((p) => p.connected)) return false;

    const opponent: TeamId = teamId === "A" ? "B" : "A";
    const opponentConnected = room.state.players.some((p) => p.teamId === opponent && p.connected);
    if (!opponentConnected) return false;

    this.finalizeRoundWinner(room, opponent, "OPPONENT_DISCONNECTED");
    return true;
  }

  closeRoom(roomCode: RoomCode): void {
    this.rooms.delete(roomCode);
  }

  /** 공개 상태 스냅샷. claimToken은 항상 마스킹한다(§15.2). */
  getPublicState(room: RoomRecord): RoomState {
    // 다이노런 전환 후에는 마스킹할 비밀 상태가 없다 — 그대로 내보낸다.
    return room.state;
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
