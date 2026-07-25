/** Plan.md §13, §14.2, §15 도메인 타입. 서버 권위 상태와 클라이언트 표시에 공유된다. */

export type RoomCode = string; // ^[0-9]{4}$
export type PlayerId = string;
export type SocketId = string;
export type RequestId = string; // UUID v4

/**
 * 원본 Stan 골격의 254개 세부 메시를 퍼즐용 대형 해부학 조각 13개로 묶는다.
 * Godot 쪽 실제 노드 매핑은 desktop-godot/scripts/TrexPuzzleModel.gd 참고.
 */
export type BoneId =
  | "SKULL"
  | "JAW"
  | "NECK"
  | "SPINE"
  | "RIBCAGE"
  | "PELVIS"
  | "ARM_LEFT"
  | "ARM_RIGHT"
  | "LEG_LEFT"
  | "LEG_RIGHT"
  | "TAIL_BASE"
  | "TAIL_MIDDLE"
  | "TAIL_TIP";

export const BONE_IDS: readonly BoneId[] = [
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
];

export type TeamId = "A" | "B";
export const TEAM_IDS: readonly TeamId[] = ["A", "B"];

export type SensorPermission = "UNKNOWN" | "GRANTED" | "DENIED" | "UNSUPPORTED";
export type AimMode = "GYRO" | "TOUCHPAD";
export type RevivalForm = "NONE" | "NORMAL" | "YRANNO";
export type HitZone = "HEART" | "SKULL" | "SPINE" | "BONE" | "JOINT_OUTSIDE";
export type CoreZone = "HEART" | "SKULL" | "SPINE";
export type PoseId = "IDLE" | "WALK" | "ROAR" | "HIT" | "REVIVE";
export type Facing = "LEFT" | "RIGHT";

export type RoomPhase = "LOBBY" | "PLAYING" | "RESULT" | "DECORATION";
export type TeamPhase = "EXCAVATION" | "ASSEMBLY" | "CHARGING" | "REVIVED";

export type NormalizedPoint = {
  x: number; // 0 <= x <= 1
  y: number; // 0 <= y <= 1
};

export type Transform2D = NormalizedPoint & {
  rotationDeg: number; // -180 <= rotationDeg <= 180
};

export type ErrorCode =
  | "INVALID_PAYLOAD"
  | "CLIENT_VERSION_UNSUPPORTED"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_ALREADY_STARTED"
  | "NICKNAME_INVALID"
  | "NICKNAME_TAKEN"
  | "HOST_ONLY"
  | "PLAYER_NOT_JOINED"
  | "WRONG_ROOM_PHASE"
  | "WRONG_TEAM_PHASE"
  | "TEAM_ELIMINATED"
  | "RATE_LIMITED"
  | "DUPLICATE_REQUEST"
  | "BONE_NOT_AVAILABLE"
  | "PIECE_ALREADY_CLAIMED"
  | "PIECE_CLAIM_EXPIRED"
  | "SHOT_COOLDOWN"
  | "SERVER_ERROR";

export type ApiError = {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
};

export type Ack<T> =
  | {
      ok: true;
      requestId: RequestId;
      serverTime: number;
      data: T;
    }
  | {
      ok: false;
      requestId: RequestId;
      serverTime: number;
      error: ApiError;
    };

export type PlayerStats = {
  excavationInputs: number;
  puzzleCorrect: number;
  puzzleWrong: number;
  shots: number;
  hits: number;
  coreHits: number;
  energyContributed: number;
};

export type PublicPlayer = {
  id: PlayerId;
  nickname: string;
  teamId: TeamId;
  color: string; // CSS hex: #RRGGBB
  connected: boolean;
  ready: boolean;
  aimMode: AimMode;
  motionPermission: SensorPermission;
  orientationPermission: SensorPermission;
  stats: PlayerStats;
};

export type PuzzlePieceState = {
  boneId: BoneId;
  discovered: boolean;
  fixed: boolean;
  transform: Transform2D;
  claimedBy: PlayerId | null;
  claimToken: string | null; // room:state에서는 항상 null로 마스킹
  claimExpiresAt: number | null;
  lockedUntil: number | null;
};

export type TeamState = {
  id: TeamId;
  phase: TeamPhase;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  playerIds: PlayerId[];
  excavation: {
    points: number;
    nextBoneAt: number;
    discoveredBoneIds: BoneId[];
    fossils: number;
    efficiencyMultiplier: number;
    debuffEndsAt: number | null;
  };
  puzzle: {
    pieces: PuzzlePieceState[];
    fixedCount: number;
    completedAt: number | null;
  };
  charging: {
    energy: number; // 0~100
    stability: number; // 0~100
    activeCore: CoreZone;
    coreChangesAt: number;
    form: RevivalForm;
  };
};

export type WinnerReason = "NORMAL_REVIVAL" | "OPPONENT_DISCONNECTED" | "TIME_LIMIT" | "DRAW" | null;

export type RoomState = {
  schemaVersion: 1;
  revision: number;
  roomCode: RoomCode;
  roomPhase: RoomPhase;
  createdAt: number;
  roundStartedAt: number | null;
  roundEndsAt: number | null;
  hostConnected: boolean;
  players: PublicPlayer[];
  teams: Record<TeamId, TeamState>;
  winner: {
    teamId: TeamId | null;
    reason: WinnerReason;
  };
};

export type DecorationCategory = "HAT" | "GLASSES" | "NECK" | "BACKGROUND";

export type MuseumTyranno = {
  id: string;
  name: string;
  form: RevivalForm;
  teamId: TeamId;
  teamMembers: string[];
  createdAt: number;
  dataVersion: 1;
  excavationMs: number | null;
  assemblyMs: number | null;
  chargingMs: number | null;
  accuracy: number; // hits / shots, 0~1
  decorations: Partial<Record<DecorationCategory, string>>;
  fossils: number;
};
