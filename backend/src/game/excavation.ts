/** Plan.md §6.1, §17.5. 서버 권위 발굴 판정. 순수 로직은 RoomRecord를 직접 변형한다. */

import {
  BONE_IDS,
  boneCountForTeam,
  EXCAVATION_EVENT_FOSSIL_CHANCE,
  EXCAVATION_EVENT_GOLD_BONE_CHANCE,
  EXCAVATION_GOLD_BONE_POINT_DISCOUNT,
  EXCAVATION_MAX_INPUTS_PER_SECOND,
  EXCAVATION_POINTS_PER_BONE,
  EXCAVATION_TEAM_OVERFLOW_EFFICIENCY,
  type BoneId,
  type ExcavateInput,
  type PlayerId,
  type TeamId,
} from "@trex/shared";
import type { RoomRecord } from "../rooms/RoomManager.js";
import { seededRandom01, seededShuffle } from "./seededRandom.js";

export type RateBucket = { tokens: number; lastRefillMs: number };

export type ExcavationEventKind = "FOSSIL" | "GOLD_BONE";

export type ExcavationApplyResult = {
  accepted: boolean;
  pointsAdded: number;
  boneAwards: BoneId[];
  event: { kind: ExcavationEventKind; endsAt: number | null } | null;
  phaseCompleted: boolean;
};

export function makeBoneOrder(seed: string): BoneId[] {
  return seededShuffle(BONE_IDS, seed, "boneOrder");
}

export type ExcavationTeamState = {
  tick: number;
  teamBucket: RateBucket;
  playerBuckets: Map<PlayerId, RateBucket>;
  lastSeqByPlayer: Map<PlayerId, number>;
};

export type ExcavationRoomState = Record<TeamId, ExcavationTeamState>;

function newBucket(now: number): RateBucket {
  return { tokens: EXCAVATION_MAX_INPUTS_PER_SECOND, lastRefillMs: now };
}

export function createExcavationState(now: number): ExcavationRoomState {
  return {
    A: { tick: 0, teamBucket: newBucket(now), playerBuckets: new Map(), lastSeqByPlayer: new Map() },
    B: { tick: 0, teamBucket: newBucket(now), playerBuckets: new Map(), lastSeqByPlayer: new Map() },
  };
}

function refill(bucket: RateBucket, now: number): void {
  const elapsedSec = Math.max(0, now - bucket.lastRefillMs) / 1000;
  bucket.tokens = Math.min(EXCAVATION_MAX_INPUTS_PER_SECOND, bucket.tokens + elapsedSec * EXCAVATION_MAX_INPUTS_PER_SECOND);
  bucket.lastRefillMs = now;
}

/** 플레이어 단위: 초과분은 완전히 버린다 (§6.1 "최근 1초 ... 최대 12회 인정"). */
function consumePlayerBucket(bucket: RateBucket, requested: number, now: number): number {
  refill(bucket, now);
  const accepted = Math.min(requested, bucket.tokens);
  bucket.tokens -= accepted;
  return accepted;
}

/** 팀 단위: 상한 초과분은 버리지 않고 절반 효율로 인정한다 (§4 "완만한 효율 감소"). */
function consumeTeamBucket(bucket: RateBucket, rawCount: number, now: number): number {
  refill(bucket, now);
  const full = Math.min(rawCount, bucket.tokens);
  bucket.tokens -= full;
  const overflow = rawCount - full;
  return full + overflow * EXCAVATION_TEAM_OVERFLOW_EFFICIENCY;
}

function rollEvent(seed: string, tickIndex: number): ExcavationEventKind | null {
  const r = seededRandom01(`${seed}:event`, tickIndex);
  if (r < EXCAVATION_EVENT_FOSSIL_CHANCE) return "FOSSIL";
  if (r < EXCAVATION_EVENT_FOSSIL_CHANCE + EXCAVATION_EVENT_GOLD_BONE_CHANCE) return "GOLD_BONE";
  return null;
}

export function applyExcavateInput(
  room: RoomRecord,
  teamId: TeamId,
  playerId: PlayerId,
  input: ExcavateInput,
  now: number,
): ExcavationApplyResult {
  const reject: ExcavationApplyResult = { accepted: false, pointsAdded: 0, boneAwards: [], event: null, phaseCompleted: false };

  const team = room.state.teams[teamId];
  // result가 이미 정해졌다는 건 이 팀은 발굴을 끝내고 상대를 기다리는 중이라는 뜻 — phase는
  // 아직 EXCAVATION이지만 더 이상 입력을 받지 않는다. 안 막으면 매 입력마다 phaseCompleted가
  // 다시 true가 되어 excavationTransitionAt이 계속 뒤로 밀려 다이노런 전환이 영원히 안 된다.
  if (team.phase !== "EXCAVATION" || team.excavation.result !== null) return reject;
  if (input.count !== input.sourceCounts.motion + input.sourceCounts.tap) return reject;

  const state = room.excavation[teamId];

  const lastSeq = state.lastSeqByPlayer.get(playerId) ?? -1;
  if (input.seq <= lastSeq) return reject;
  state.lastSeqByPlayer.set(playerId, input.seq);

  let playerBucket = state.playerBuckets.get(playerId);
  if (!playerBucket) {
    playerBucket = newBucket(now);
    state.playerBuckets.set(playerId, playerBucket);
  }
  const playerAccepted = consumePlayerBucket(playerBucket, input.count, now);
  if (playerAccepted <= 0) return { ...reject, accepted: true };

  const player = room.state.players.find((p) => p.id === playerId);
  if (player) player.stats.excavationInputs += playerAccepted;

  const pointsAdded = consumeTeamBucket(state.teamBucket, playerAccepted, now);
  team.excavation.points += pointsAdded;

  const boneOrder = room.boneOrder;
  const targetBoneCount = boneCountForTeam(team.playerIds.length);
  const boneAwards: BoneId[] = [];
  while (team.excavation.points >= team.excavation.nextBoneAt && team.excavation.discoveredBoneIds.length < targetBoneCount) {
    const boneId = boneOrder[team.excavation.discoveredBoneIds.length]!;
    team.excavation.discoveredBoneIds.push(boneId);
    team.excavation.nextBoneAt += EXCAVATION_POINTS_PER_BONE;
    boneAwards.push(boneId);
  }

  state.tick += 1;
  const eventKind = rollEvent(room.roundSeed!, state.tick);
  let event: ExcavationApplyResult["event"] = null;
  if (eventKind === "FOSSIL") {
    team.excavation.fossils += 1;
    event = { kind: "FOSSIL", endsAt: null };
  } else if (eventKind === "GOLD_BONE") {
    team.excavation.nextBoneAt = Math.max(0, team.excavation.nextBoneAt - EXCAVATION_GOLD_BONE_POINT_DISCOUNT);
    event = { kind: "GOLD_BONE", endsAt: null };
  }

  const phaseCompleted = team.excavation.discoveredBoneIds.length >= targetBoneCount;

  return { accepted: true, pointsAdded, boneAwards, event, phaseCompleted };
}
