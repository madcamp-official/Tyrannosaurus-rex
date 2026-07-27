/** Plan.md §4, §6 권장 초기 수치. 실기기 테스트 중 조정하는 유일한 밸런스 원천. */

// Plan.md §2.2, §5.1: 팀 내부 식별자(TeamId)는 A/B를 그대로 쓰고, 화면 표시 이름만 다르게 한다.
export const TEAM_DISPLAY_NAMES: Record<"A" | "B", string> = {
  A: "T라노 팀",
  B: "F라노 팀",
};

// TODO: 테스트용으로 5로 줄임 — 나중에 13으로 되돌릴 것.
export const CORE_BONE_COUNT = 5;
export const EXCAVATION_POINTS_PER_BONE = 60;
export const EXCAVATION_SHAKE_COOLDOWN_MS = 200;
export const MOBILE_INPUT_FLUSH_MS = 100;
export const EXCAVATION_MAX_INPUTS_PER_SECOND = 12;
export const EXCAVATION_GOLD_BONE_POINT_DISCOUNT = 20;
// 먼저 끝난 팀은 상대가 끝날 때까지 기다렸다가, 승/패가 갈리면 이 시간만큼 결과를 보여준 뒤
// 두 팀이 동시에 다음 라운드(다이노런)로 넘어간다.
export const ROUND_TRANSITION_MS = 3_000;
// Plan.md §4는 "완만한 효율 감소"라고만 서술하고 정확한 수치는 주지 않는다. 팀 합산 초당 입력이
// EXCAVATION_MAX_INPUTS_PER_SECOND(1인분 최대치)를 넘는 초과분에 이 배율을 곱해 점수로 인정한다.
export const EXCAVATION_TEAM_OVERFLOW_EFFICIENCY = 0.5;
// 발굴 이벤트 확률도 Plan.md에 수치가 없어 MVP 기본값으로 정했다. 돌 이벤트(효율 감소)는 제거됨.
export const EXCAVATION_EVENT_FOSSIL_CHANCE = 0.1;
export const EXCAVATION_EVENT_GOLD_BONE_CHANCE = 0.05;

// Plan.md §6.2 골격 조립 다이노런.
export const DINO_RUN_DURATION_MS = 30_000;
export const DINO_OBSTACLE_COUNT = 12;
export const DINO_JUMP_WINDOW_MS = 450; // 장애물 시각 ±이 값 안의 점프만 클리어
// 탈락 판정은 클리어 판정 창이 닫힌 뒤에도 이 시간만큼 더 기다린다 — 네트워크 지연으로
// 창 끝자락에 보낸 점프가 늦게 도착해도 억울하게 죽지 않도록 하는 유예 시간.
export const DINO_DEATH_GRACE_MS = 500;
export const DINO_JUMP_MAX_PER_SECOND = 3;
export const DINO_OBSTACLE_MIN_OFFSET_MS = 5_000; // 시작 5초는 장애물 없이 몸풀기 구간
export const DINO_OBSTACLE_MAX_OFFSET_MS = 28_000;
export const DINO_OBSTACLE_MIN_GAP_MS = 1_500;
// 조립 평가 등급 경계 (클리어율)
export const DINO_GRADE_PERFECT = 0.85;
export const DINO_GRADE_GOOD = 0.6;
export const DINO_GRADE_CLUMSY = 0.3;
// 충전 시작 안정도 = BASE + RANGE × 클리어율
export const CHARGING_START_STABILITY_BASE = 40;
export const CHARGING_START_STABILITY_RANGE = 60;

export const CHARGING_DURATION_MS = 90_000;
export const CHARGING_TREX_TRANSFORM_HZ = 10;
export const SHOT_COOLDOWN_MS = 350;
export const AIM_UPDATE_MAX_HZ = 30;
export const AIM_STALE_MS = 500;
export const ENERGY_HIT_BONE = 4;
export const ENERGY_HIT_CORE = 7;
export const ENERGY_HIT_JOINT_OUTSIDE = 2;
export const STABILITY_HIT_JOINT_OUTSIDE = -3;
export const STABILITY_HIT_CORE = 2;
export const ENERGY_TARGET = 100;
export const STABILITY_TARGET = 100;
// Plan.md §6.3은 "단순 히트박스"만 요구하고 정확한 반경/이동 공식은 없다. 정규화 좌표 기준
// MVP 기본값이며, 실제 3D 히트박스가 생기면 Godot 쪽과 맞춰 조정한다.
export const CORE_HIT_RADIUS = 0.05;
export const BONE_HIT_RADIUS = 0.18;
export const JOINT_HIT_RADIUS = 0.28;
export const CORE_ROTATION_INTERVAL_MS = 15_000;
export const TREX_MOVE_AMPLITUDE = 0.28; // 중심(0.5)에서 좌우로 흔들리는 폭
export const TREX_MOVE_PERIOD_MS = 4_000;

// Plan.md §2.3, §3 3경기 누적 점수제. 구체적 계수가 문서에 없어 MVP 기본값으로 정한다.
export const GAME_SCORE_MAX = 100;
// 경기 3 점수 = 명중률 비중 + 활성 코어 명중 비중(코어 히트 수를 기준치로 정규화).
export const SHOOTING_SCORE_ACCURACY_WEIGHT = 60;
export const SHOOTING_SCORE_CORE_WEIGHT = 40;
export const SHOOTING_SCORE_CORE_HITS_FOR_FULL_MARKS = 8;
// 개인 MVP 가중치. coreHits는 hits의 부분집합이지만, 핵심 부위 명중을 더 우대하기 위해 별도로 더한다.
export const MVP_WEIGHT_EXCAVATION_INPUT = 1;
export const MVP_WEIGHT_DINO_CLEARED = 3;
export const MVP_WEIGHT_HIT = 2;
export const MVP_WEIGHT_CORE_HIT = 3;
export const MVP_TOP_COUNT = 3;

export const ROUND_DURATION_MS = 300_000;
export const DECORATION_VOTE_DURATION_MS = 20_000;

export const MIN_PLAYERS = 2;
// Plan.md §2.2: 방 생성 시 호스트가 팀별 최대 인원을 지정한다. 시스템 상한 10명, 폼 기본값 5명.
export const MAX_PLAYERS_PER_TEAM_CAP = 10;
export const DEFAULT_MAX_PLAYERS_PER_TEAM = 5;
export const ROOM_NAME_MAX_LENGTH = 20;
export const TEAM_NAME_MAX_LENGTH = 12;
export const NICKNAME_MIN_LENGTH = 1;
export const NICKNAME_MAX_LENGTH = 8;
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_MAX_GENERATION_ATTEMPTS = 20;

export const REQUEST_ID_CACHE_MAX_ENTRIES = 100;
export const REQUEST_ID_CACHE_TTL_MS = 5 * 60_000;

export const MUSEUM_MAX_ENTRIES = 20;

export const BRIDGE_PROTOCOL_VERSION = 1 as const;
export const BRIDGE_FULL_SNAPSHOT_INTERVAL_MS = 5_000;
export const GODOT_READY_TIMEOUT_MS = 15_000;

export const API_VERSION = 1 as const;
