/** Plan.md §4, §6 권장 초기 수치. 실기기 테스트 중 조정하는 유일한 밸런스 원천. */

export const CORE_BONE_COUNT = 9;
export const EXCAVATION_POINTS_PER_BONE = 60;
export const EXCAVATION_SHAKE_COOLDOWN_MS = 200;
export const MOBILE_INPUT_FLUSH_MS = 100;
export const EXCAVATION_MAX_INPUTS_PER_SECOND = 12;
export const EXCAVATION_STONE_DEBUFF_MS = 3_000;
export const EXCAVATION_STONE_EFFICIENCY_MULTIPLIER = 0.8;
export const EXCAVATION_GOLD_BONE_POINT_DISCOUNT = 20;

export const PUZZLE_PIECE_COUNT = CORE_BONE_COUNT;
export const PUZZLE_MAX_CONCURRENT_CLAIMS_PER_TEAM = 2;
export const PUZZLE_CLAIM_TTL_MS = 5_000;
export const PUZZLE_MOVE_MAX_HZ = 20;
export const PUZZLE_WRONG_PLACEMENT_LOCK_MS = 2_000;
export const PUZZLE_POSITION_TOLERANCE_RATIO = 0.12;
export const PUZZLE_ROTATION_TOLERANCE_DEG = 15;

export const CHARGING_DURATION_MS = 90_000;
export const CHARGING_TREX_TRANSFORM_HZ = 10;
export const SHOT_COOLDOWN_MS = 350;
export const AIM_UPDATE_MAX_HZ = 30;
export const AIM_STALE_MS = 500;
export const ENERGY_HIT_BONE = 4;
export const ENERGY_HIT_CORE = 7;
export const STABILITY_HIT_JOINT_OUTSIDE = -3;
export const STABILITY_HIT_CORE = 2;
export const ENERGY_TARGET = 100;
export const STABILITY_TARGET = 100;
export const PURIFICATION_DURATION_MS = 10_000;

export const ROUND_DURATION_MS = 300_000;
export const DECORATION_VOTE_DURATION_MS = 20_000;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const MAX_PLAYERS_PER_TEAM = 3;
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
