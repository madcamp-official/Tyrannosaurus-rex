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

/**
 * 팀 발굴 "웨이브(포인트 임계값 통과 횟수)" 수 = 팀 인원수 × BONES_PER_PLAYER
 * (최대 BONE_IDS.length번까지) — 발굴 난이도(필요한 총 포인트)를 인원수에 맞춘다.
 * 실제로 발견되는 뼈 개수와는 다르다: 뼈는 항상 BONE_IDS.length(13)개 전부 나온다
 * (boneWaveSizes 참고) — 인원이 적어 웨이브 수가 적으면 한 웨이브에 여러 개씩 몰아서 나온다.
 */
export function boneCountForTeam(playerCount: number): number {
  return Math.min(BONE_IDS.length, Math.max(1, playerCount) * BONES_PER_PLAYER);
}

/**
 * BONE_IDS.length(13)개를 waveCount번의 발굴 웨이브에 최대한 고르게 나눈다 — 나머지는
 * 뒤쪽 웨이브에 하나씩 더 붙인다 (예: waveCount=4 → [3,3,3,4]). 팀 인원이 적어 웨이브
 * 수가 적어도, 모든 웨이브를 다 채우면 항상 뼈 13개 전부를 모으게 된다.
 */
export function boneWaveSizes(waveCount: number): number[] {
  const total = BONE_IDS.length;
  const count = Math.max(1, Math.min(total, waveCount));
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, i) => base + (i >= count - remainder ? 1 : 0));
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

export type SkyObjectKind = "METEOR" | "BONUS";
/** phase 시작 기준 낙하 오브젝트 하나. 라운드 시드로 생성, 양 팀 동일(§4 공정성). */
export type SkyObject = {
  id: number;
  /** phase 시작부터 이 오브젝트가 판정 지점(플레이어 위치)에 도달하는 시각(ms). */
  hitAtMs: number;
  /** 0~1 정규화 좌우 위치. */
  x: number;
  kind: SkyObjectKind;
};

/**
 * 골격 조립 단계 상태 — 하늘에서 떨어지는 운석(METEOR)을 피하고 보너스 아이템(BONUS)을
 * 잡는 미니게임. 판정은 전적으로 서버가 한다. 각 플레이어가 자기 위치(dino:position)를
 * 독립적으로 조작하며, 같은 낙하 스케줄을 팀 전체가 공유한다.
 */
export type DinoRunState = {
  skyObjects: SkyObject[];
  /** 플레이어별 남은 목숨(METEOR_DODGE_LIVES에서 시작, 0이면 탈락). */
  livesByPlayer: Record<PlayerId, number>;
  /** 플레이어별 누적 점수 (운석에 맞으면 감소, 보너스를 잡으면 증가). */
  scoreByPlayer: Record<PlayerId, number>;
  /** 플레이어별로 이미 판정을 마친 오브젝트 id — 같은 오브젝트를 중복 판정하지 않는다. */
  resolvedObjectIdsByPlayer: Record<PlayerId, number[]>;
  /** 목숨이 0이 된 플레이어. 탈락 후에는 더 이상 판정하지 않는다. */
  deadPlayerIds: PlayerId[];
  /** 0~1 팀 성능. 60초 종료 시 팀 점수 합을 정규화해 확정된다. */
  performance: number | null;
  grade: DinoRunGrade | null;
  /** 두 팀 다 끝나면 성능을 비교해 정해진다. 정해지면 잠시 대기 후 함께 CHARGING으로 넘어간다. */
  result: "WIN" | "LOSE" | "DRAW" | null;
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
    /** 발굴을 먼저 끝내면 WIN, 상대도 끝내면 그 상대는 LOSE — 단 EXCAVATION_DRAW_WINDOW_MS
     * 안에 거의 동시에 끝나면 둘 다 DRAW로 정정된다. 둘 다 정해지면 잠시 대기 후 다음 라운드로 함께 넘어간다. */
    result: "WIN" | "LOSE" | "DRAW" | null;
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
