/** Plan.md §4, §6 권장 초기 수치. 실기기 테스트 중 조정하는 유일한 밸런스 원천. */

export const CORE_BONE_COUNT = 13;
export const EXCAVATION_POINTS_PER_BONE = 60;
export const EXCAVATION_SHAKE_COOLDOWN_MS = 200;
export const MOBILE_INPUT_FLUSH_MS = 100;
export const EXCAVATION_MAX_INPUTS_PER_SECOND = 12;
export const EXCAVATION_STONE_DEBUFF_MS = 3_000;
export const EXCAVATION_STONE_EFFICIENCY_MULTIPLIER = 0.8;
export const EXCAVATION_GOLD_BONE_POINT_DISCOUNT = 20;
// Plan.md §4는 "완만한 효율 감소"라고만 서술하고 정확한 수치는 주지 않는다. 팀 합산 초당 입력이
// EXCAVATION_MAX_INPUTS_PER_SECOND(1인분 최대치)를 넘는 초과분에 이 배율을 곱해 점수로 인정한다.
export const EXCAVATION_TEAM_OVERFLOW_EFFICIENCY = 0.5;
// 발굴 이벤트 확률도 Plan.md에 수치가 없어 MVP 기본값으로 정했다. 세 확률의 합은 1 이하여야 한다.
export const EXCAVATION_EVENT_STONE_CHANCE = 0.15;
export const EXCAVATION_EVENT_FOSSIL_CHANCE = 0.1;
export const EXCAVATION_EVENT_GOLD_BONE_CHANCE = 0.05;

// Plan.md §6.2 골격 조립 다이노런.
export const DINO_RUN_DURATION_MS = 30_000;
export const DINO_OBSTACLE_COUNT = 12;
export const DINO_JUMP_WINDOW_MS = 450; // 장애물 시각 ±이 값 안의 점프만 클리어
export const DINO_JUMP_MAX_PER_SECOND = 3;
export const DINO_OBSTACLE_MIN_OFFSET_MS = 2_000;
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
export const CORE_ROTATION_INTERVAL_MS = 5_000;
export const TREX_MOVE_AMPLITUDE = 0.28; // 중심(0.5)에서 좌우로 흔들리는 폭
export const TREX_MOVE_PERIOD_MS = 4_000;

export const ROUND_DURATION_MS = 300_000;
export const DECORATION_VOTE_DURATION_MS = 20_000;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const MAX_PLAYERS_PER_TEAM = 5;
export const NICKNAME_MIN_LENGTH = 1;
export const NICKNAME_MAX_LENGTH = 8;
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_MAX_GENERATION_ATTEMPTS = 20;

export const REQUEST_ID_CACHE_MAX_ENTRIES = 100;
export const REQUEST_ID_CACHE_TTL_MS = 5 * 60_000;

export const MUSEUM_MAX_ENTRIES = 20;
export const MUSEUM_STORAGE_KEY = "trex.museum.v1";

export const BRIDGE_PROTOCOL_VERSION = 1 as const;
export const BRIDGE_FULL_SNAPSHOT_INTERVAL_MS = 5_000;
export const GODOT_READY_TIMEOUT_MS = 15_000;

export const API_VERSION = 1 as const;
