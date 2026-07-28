/** Plan.md §13, §14.2, §15 도메인 타입. 서버 권위 상태와 클라이언트 표시에 공유된다. */

import { BONES_PER_PLAYER } from "./constants.js";

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

/** 팀 발굴 목표 뼈 개수 = 팀 인원수 × BONES_PER_PLAYER (최대 BONE_IDS.length개까지). */
export function boneCountForTeam(playerCount: number): number {
  return Math.min(BONE_IDS.length, Math.max(1, playerCount) * BONES_PER_PLAYER);
}

export type TeamId = "A" | "B";
export const TEAM_IDS: readonly TeamId[] = ["A", "B"];

export type SensorPermission = "UNKNOWN" | "GRANTED" | "DENIED" | "UNSUPPORTED";
export type AimMode = "GYRO" | "TOUCHPAD";
export type RevivalForm = "NONE" | "NORMAL" | "YRANNO";
export type HitZone = "HEART" | "SKULL" | "SPINE" | "BONE";
export type CoreZone = "HEART" | "SKULL" | "SPINE";
export type PoseId = "IDLE" | "WALK" | "ROAR" | "HIT" | "REVIVE";
export type Facing = "LEFT" | "RIGHT";

export type RoomPhase = "LOBBY" | "PLAYING" | "RESULT" | "DECORATION";
export type TeamPhase = "EXCAVATION" | "ASSEMBLY" | "CHARGING_PRACTICE" | "CHARGING" | "REVIVED";

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
  dinoCleared: number;
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

export type DinoRunGrade = "PERFECT" | "GOOD" | "CLUMSY" | "MESSY";

/** Plan.md §6.2. 골격 조립 다이노런 상태. 판정은 전적으로 서버가 한다. */
export type DinoRunState = {
  /** phase 시작 기준 장애물 등장 오프셋(ms). 라운드 시드로 생성, 양 팀 동일. */
  obstacleOffsetsMs: number[];
  /** 플레이어별 클리어한 장애물 index 목록. */
  clearedByPlayer: Record<PlayerId, number[]>;
  /** 장애물을 놓쳐 탈락한 플레이어. 탈락 후에는 남은 시간 동안 점프해도 클리어로 인정하지 않는다. */
  deadPlayerIds: PlayerId[];
  /** 0~1 팀 클리어율. 30초 종료 시 확정. */
  performance: number | null;
  grade: DinoRunGrade | null;
};

/** Plan.md §2.3, §3. 경기 1~3(발굴·다이노런·사격) 각각의 점수. 완료 전에는 null. 0~100 스케일. */
export type GameScores = {
  excavation: number | null;
  dinoRun: number | null;
  charging: number | null;
};

/** 세 경기 점수를 합산한 팀 총점. 미완료 경기는 0점으로 취급한다. */
export function totalGameScore(scores: GameScores): number {
  return (scores.excavation ?? 0) + (scores.dinoRun ?? 0) + (scores.charging ?? 0);
}

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
    /** 발굴을 먼저 끝내면 WIN, 상대도 끝내면 그 상대는 LOSE. 둘 다 정해지면 잠시 대기 후 다음 라운드로 함께 넘어간다. */
    result: "WIN" | "LOSE" | null;
  };
  dinoRun: DinoRunState;
  charging: {
    energy: number; // 0~100
    stability: number; // 0~100
    activeCore: CoreZone;
    coreChangesAt: number;
    form: RevivalForm;
  };
  scores: GameScores;
};

/** Plan.md §3. 3경기 누적 점수 합산으로 최종 승패가 갈렸으면 SCORE_TOTAL. */
export type WinnerReason = "SCORE_TOTAL" | "OPPONENT_DISCONNECTED" | "TIME_LIMIT" | "DRAW" | null;

/** Plan.md §2.3 결과 화면. 개인 MVP 1~3위 산정 결과 한 명. */
export type MvpEntry = {
  playerId: PlayerId;
  nickname: string;
  teamId: TeamId;
  score: number;
};

export type RoomState = {
  schemaVersion: 1;
  revision: number;
  roomCode: RoomCode;
  roomName: string;
  maxPlayersPerTeam: number;
  /** Plan.md §2.2. 호스트가 방 생성 시 지정한 팀 표시 이름. 미지정 시 TEAM_DISPLAY_NAMES 기본값. */
  teamNames: Record<TeamId, string>;
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

/** Plan.md §8. 서버 SQLite DB(backend/src/db/museumDb.ts)의 한 행과 1:1 대응하는 공유 계약. */
export type MuseumTyranno = {
  id: string;
  roomName: string;
  teamId: TeamId;
  teamName: string;
  isWinner: boolean;
  form: RevivalForm;
  tyrannoName: string | null;
  teamMembers: string[];
  mvpNickname: string | null;
  mvpScore: number | null;
  decorations: Partial<Record<DecorationCategory, string>>;
  excavationMs: number | null;
  assemblyMs: number | null;
  chargingMs: number | null;
  accuracy: number; // hits / shots, 0~1
  fossils: number;
  createdAt: number;
};
