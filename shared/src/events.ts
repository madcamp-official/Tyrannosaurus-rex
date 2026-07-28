/** Plan.md §16~18. Socket.IO 이벤트 payload. 요청은 Zod로 런타임 검증하고, 타입은 스키마에서 추론한다. */

import { z } from "zod";
import { MAX_PLAYERS_PER_TEAM_CAP, ROOM_NAME_MAX_LENGTH, TEAM_NAME_MAX_LENGTH } from "./constants.js";
import type {
  Ack,
  AimMode,
  ApiError,
  BoneId,
  CoreZone,
  DinoRunGrade,
  Facing,
  GameScores,
  HitZone,
  MvpEntry,
  NormalizedPoint,
  PlayerId,
  PoseId,
  PublicPlayer,
  RequestId,
  RoomCode,
  RoomState,
  SensorPermission,
  SkyObject,
  TeamId,
  TeamPhase,
  Transform2D,
} from "./domain.js";

// ---------------------------------------------------------------------------
// 공통 조각 스키마
// ---------------------------------------------------------------------------

export const roomCodeSchema: z.ZodType<RoomCode> = z
  .string()
  .regex(/^[0-9]{4}$/, "roomCode must be 4 digits");

export const requestIdSchema: z.ZodType<RequestId> = z.string().uuid();

export const normalizedPointSchema: z.ZodType<NormalizedPoint> = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const transform2DSchema: z.ZodType<Transform2D> = normalizedPointSchema.and(
  z.object({
    rotationDeg: z.number().min(-180).max(180),
  }),
);

export const boneIdSchema: z.ZodType<BoneId> = z.enum([
  "SKULL",
  "JAW",
  "NECK",
  "SPINE",
  "RIBCAGE",
  "PELVIS",
  "ARM_LEFT",
  "ARM_RIGHT",
  "LEG_LEFT",
  "LEG_RIGHT",
  "TAIL_BASE",
  "TAIL_MIDDLE",
  "TAIL_TIP",
]);

export const teamIdSchema: z.ZodType<TeamId> = z.enum(["A", "B"]);
export const aimModeSchema: z.ZodType<AimMode> = z.enum(["GYRO", "TOUCHPAD"]);
export const sensorPermissionSchema: z.ZodType<SensorPermission> = z.enum([
  "UNKNOWN",
  "GRANTED",
  "DENIED",
  "UNSUPPORTED",
]);
// ---------------------------------------------------------------------------
// 17. 클라이언트 → 서버 요청
// ---------------------------------------------------------------------------

export const roomCreateRequestSchema = z.object({
  requestId: requestIdSchema,
  roomName: z.string().trim().min(1).max(ROOM_NAME_MAX_LENGTH),
  settings: z.object({
    maxPlayersPerTeam: z.number().int().min(1).max(MAX_PLAYERS_PER_TEAM_CAP),
    roundDurationSec: z.literal(300),
    language: z.literal("ko"),
    teamAName: z.string().trim().min(1).max(TEAM_NAME_MAX_LENGTH).optional(),
    teamBName: z.string().trim().min(1).max(TEAM_NAME_MAX_LENGTH).optional(),
  }),
});
export type RoomCreateRequest = z.infer<typeof roomCreateRequestSchema>;
export type RoomCreateResponse = { roomCode: RoomCode; joinUrl: string; state: RoomState };

export const roomJoinRequestSchema = z.object({
  requestId: requestIdSchema,
  roomCode: roomCodeSchema,
  nickname: z.string().trim().min(1).max(8),
});
export type RoomJoinRequest = z.infer<typeof roomJoinRequestSchema>;
export type RoomJoinResponse = { playerId: PlayerId; teamId: TeamId; color: string; state: RoomState };

export const playerSetReadyRequestSchema = z.object({
  requestId: requestIdSchema,
  ready: z.boolean(),
});
export type PlayerSetReadyRequest = z.infer<typeof playerSetReadyRequestSchema>;
export type PlayerSetReadyResponse = { playerId: PlayerId; ready: boolean };

export const gameStartRequestSchema = z.object({
  requestId: requestIdSchema,
});
export type GameStartRequest = z.infer<typeof gameStartRequestSchema>;
export type GameStartResponse = { roundStartedAt: number; roundEndsAt: number; seed: string; state: RoomState };

export const excavateInputSchema = z.object({
  seq: z.number().int().nonnegative(),
  count: z.number().int().min(0).max(5),
  sourceCounts: z.object({
    motion: z.number().int().min(0).max(5),
    tap: z.number().int().min(0).max(5),
  }),
  clientTime: z.number(),
});
export type ExcavateInput = z.infer<typeof excavateInputSchema>;

// 운석 피하기: 조준(aim:update)과 같은 패턴 — 고빈도, acknowledgement 없이 보낸다.
export const dinoPositionInputSchema = z.object({
  seq: z.number().int().nonnegative(),
  x: z.number().min(0).max(1),
  clientTime: z.number(),
});
export type DinoPositionInput = z.infer<typeof dinoPositionInputSchema>;

export const aimUpdateInputSchema = z.object({
  seq: z.number().int().nonnegative(),
  point: normalizedPointSchema,
  mode: aimModeSchema,
  calibrated: z.boolean(),
  clientTime: z.number(),
});
export type AimUpdateInput = z.infer<typeof aimUpdateInputSchema>;

export const energyFireRequestSchema = z.object({
  requestId: requestIdSchema,
  shotId: z.string().uuid(),
  clientTime: z.number(),
});
export type EnergyFireRequest = z.infer<typeof energyFireRequestSchema>;
export type EnergyFireResponse = {
  shotId: string;
  accepted: boolean;
  hit: boolean;
  hitZone: HitZone | null;
  energyDelta: number;
  stabilityDelta: number;
  energyAfter: number;
  stabilityAfter: number;
  teamPhaseAfter: TeamPhase;
};

export const sensorStatusRequestSchema = z.object({
  requestId: requestIdSchema,
  motion: sensorPermissionSchema,
  orientation: sensorPermissionSchema,
  aimMode: aimModeSchema,
  calibrated: z.boolean(),
});
export type SensorStatusRequest = z.infer<typeof sensorStatusRequestSchema>;
export type SensorStatusResponse = { acknowledged: true };

export const gameRematchRequestSchema = z.object({
  requestId: requestIdSchema,
});
export type GameRematchRequest = z.infer<typeof gameRematchRequestSchema>;
export type GameRematchResponse = { state: RoomState };

export const roomRequestStateRequestSchema = z.object({
  requestId: requestIdSchema,
  knownRevision: z.number().int().nonnegative(),
});
export type RoomRequestStateRequest = z.infer<typeof roomRequestStateRequestSchema>;
export type RoomRequestStateResponse = { changed: false; revision: number } | { changed: true; state: RoomState };

// ---------------------------------------------------------------------------
// 18. 서버 → 클라이언트 push 이벤트
// ---------------------------------------------------------------------------

export type ServerEvent<T> = {
  eventId: string;
  serverTime: number;
  roomCode: RoomCode;
  revision: number;
  data: T;
};

export type TrexTransformEvent = {
  teamId: TeamId;
  position: NormalizedPoint;
  rotationDeg: number;
  facing: Facing;
  poseId: PoseId;
  effectiveAt: number;
  /** 현재 활성 코어(약점) 이름과, 서버가 계산해 내려주는 그 코어의 절대 정규화 좌표. */
  activeCore: CoreZone;
  corePosition: NormalizedPoint;
};

export type ShotResolvedEvent = EnergyFireResponse & {
  playerId: PlayerId;
  teamId: TeamId;
  aimPoint: NormalizedPoint;
  hitPoint: NormalizedPoint | null;
};

export type GameResultEvent = {
  winnerTeamId: TeamId | null;
  reason: RoomState["winner"]["reason"];
  finishedAt: number;
  teams: Array<{
    teamId: TeamId;
    form: RoomState["teams"][TeamId]["charging"]["form"];
    energy: number;
    stability: number;
    excavationMs: number | null;
    assemblyMs: number | null;
    chargingMs: number | null;
    scores: GameScores;
    totalScore: number;
  }>;
  players: PublicPlayer[];
  /** Plan.md §2.3, §5.1. 개인 MVP 1~3위. */
  mvp: MvpEntry[];
};

export type EnergyCoreChangedEvent = { teamId: TeamId; from: CoreZone; to: CoreZone; nextChangeAt: number };

/** 클라이언트 → 서버 이벤트 이름과 payload/응답 매핑 (Socket.IO 타이핑용). */
export interface ClientToServerEvents {
  "room:create": (req: RoomCreateRequest, ack: (res: Ack<RoomCreateResponse>) => void) => void;
  "room:join": (req: RoomJoinRequest, ack: (res: Ack<RoomJoinResponse>) => void) => void;
  "player:setReady": (req: PlayerSetReadyRequest, ack: (res: Ack<PlayerSetReadyResponse>) => void) => void;
  "game:start": (req: GameStartRequest, ack: (res: Ack<GameStartResponse>) => void) => void;
  "excavate:input": (input: ExcavateInput) => void;
  "dino:position": (input: DinoPositionInput) => void;
  "aim:update": (input: AimUpdateInput) => void;
  "energy:fire": (req: EnergyFireRequest, ack: (res: Ack<EnergyFireResponse>) => void) => void;
  "sensor:status": (req: SensorStatusRequest, ack: (res: Ack<SensorStatusResponse>) => void) => void;
  "game:rematch": (req: GameRematchRequest, ack: (res: Ack<GameRematchResponse>) => void) => void;
  "room:requestState": (req: RoomRequestStateRequest, ack: (res: Ack<RoomRequestStateResponse>) => void) => void;
}

/** 서버 → 클라이언트 push 이벤트 이름과 payload 매핑. */
export interface ServerToClientEvents {
  "room:state": (evt: ServerEvent<RoomState>) => void;
  "room:playerJoined": (evt: ServerEvent<PublicPlayer>) => void;
  "room:playerConnectionChanged": (evt: ServerEvent<{ playerId: PlayerId; connected: boolean }>) => void;
  "room:phaseChanged": (
    evt: ServerEvent<{ from: RoomState["roomPhase"]; to: RoomState["roomPhase"]; endsAt: number | null }>,
  ) => void;
  "team:phaseChanged": (
    evt: ServerEvent<{ teamId: TeamId; from: TeamPhase; to: TeamPhase; endsAt: number | null }>,
  ) => void;
  "excavation:progress": (
    evt: ServerEvent<{
      teamId: TeamId;
      points: number;
      nextBoneAt: number;
      playerId: PlayerId;
      playerInputs: number;
    }>,
  ) => void;
  "excavation:boneFound": (evt: ServerEvent<{ teamId: TeamId; boneId: BoneId; index: number }>) => void;
  "excavation:eventTriggered": (
    evt: ServerEvent<{ teamId: TeamId; kind: "FOSSIL" | "GOLD_BONE"; endsAt: number | null }>,
  ) => void;
  "excavation:teamFinished": (
    evt: ServerEvent<{ teamId: TeamId; result: "WIN" | "LOSE" | "DRAW"; score: number }>,
  ) => void;
  "dino:started": (
    evt: ServerEvent<{ teamId: TeamId; skyObjects: SkyObject[]; startedAt: number; endsAt: number }>,
  ) => void;
  "dino:hit": (
    evt: ServerEvent<{ teamId: TeamId; playerId: PlayerId; objectId: number; livesLeft: number; score: number; x: number }>,
  ) => void;
  "dino:bonus": (
    evt: ServerEvent<{ teamId: TeamId; playerId: PlayerId; objectId: number; score: number; x: number }>,
  ) => void;
  "dino:playerDied": (evt: ServerEvent<{ teamId: TeamId; playerId: PlayerId }>) => void;
  "dino:finished": (
    evt: ServerEvent<{ teamId: TeamId; performance: number; grade: DinoRunGrade; startStability: number }>,
  ) => void;
  // 두 팀 다 운석 피하기를 끝내면 팀 성능 비교로 WIN/LOSE/DRAW를 정하고, 잠시 뒤(§ROUND_TRANSITION_MS)
  // team:phaseChanged(ASSEMBLY→CHARGING_PRACTICE)가 두 팀 동시에 온다.
  "dino:teamResult": (
    evt: ServerEvent<{ teamId: TeamId; result: "WIN" | "LOSE" | "DRAW"; score: number }>,
  ) => void;
  "aim:playerMoved": (
    evt: ServerEvent<{ playerId: PlayerId; teamId: TeamId; point: NormalizedPoint; active: boolean }>,
  ) => void;
  "trex:transform": (evt: ServerEvent<TrexTransformEvent>) => void;
  "energy:shotResolved": (evt: ServerEvent<ShotResolvedEvent>) => void;
  "energy:coreChanged": (evt: ServerEvent<EnergyCoreChangedEvent>) => void;
  "revival:formChanged": (
    evt: ServerEvent<{ teamId: TeamId; form: RoomState["teams"][TeamId]["charging"]["form"]; energy: number; stability: number }>,
  ) => void;
  "game:result": (evt: ServerEvent<GameResultEvent>) => void;
  "room:closed": (evt: ServerEvent<{ reason: string }>) => void;
  "room:error": (evt: { eventId: string; serverTime: number; error: ApiError }) => void;
}
