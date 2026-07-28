/** Plan.md §6.2. 골격 조립 다이노런: 시드 기반 장애물 스케줄과 서버 권위 점프 판정. */

import {
  CHARGING_START_STABILITY_BASE,
  CHARGING_START_STABILITY_RANGE,
  DINO_DEATH_GRACE_MS,
  DINO_GRADE_CLUMSY,
  DINO_GRADE_GOOD,
  DINO_GRADE_PERFECT,
  DINO_JUMP_WINDOW_MS,
  DINO_OBSTACLE_COUNT,
  DINO_OBSTACLE_MAX_OFFSET_MS,
  DINO_OBSTACLE_MIN_GAP_MS,
  DINO_OBSTACLE_MIN_OFFSET_MS,
  type DinoRunGrade,
  type PlayerId,
  type TeamId,
} from "@trex/shared";
import type { RoomRecord } from "../rooms/RoomManager.js";
import { seededRandom01 } from "./seededRandom.js";

/** 1보다 작을수록 뒤로 갈수록 장애물 간격이 좁아져 "점점 빨라지는" 느낌을 준다. */
const DINO_SPEEDUP_CURVE = 0.35;

/**
 * 라운드 시드로 장애물 오프셋을 생성한다. 양 팀이 같은 스케줄을 공유한다(§4 공정성).
 * [MIN, MAX] 구간을 지수 곡선(<1승)으로 나눠 초반엔 널널하고 후반으로 갈수록 장애물이
 * 촘촘해지게 만든 뒤 시드 지터를 더하고, 최소 간격 미만이면 뒤로 밀어 보정한다.
 * 지터 폭도 진행률에 비례해 커지게 해서, 후반부일수록 간격이 더 불규칙해지게 한다.
 */
export function makeObstacleSchedule(seed: string): number[] {
  const span = DINO_OBSTACLE_MAX_OFFSET_MS - DINO_OBSTACLE_MIN_OFFSET_MS;
  const offsets: number[] = [];
  for (let i = 0; i < DINO_OBSTACLE_COUNT; i += 1) {
    const t = i / (DINO_OBSTACLE_COUNT - 1);
    const eased = Math.pow(t, DINO_SPEEDUP_CURVE);
    const jitterMax = DINO_OBSTACLE_MIN_GAP_MS * (0.2 + 0.7 * t);
    const jitter = (seededRandom01(`${seed}:dino`, i) - 0.5) * jitterMax;
    offsets.push(Math.round(DINO_OBSTACLE_MIN_OFFSET_MS + span * eased + jitter));
  }
  for (let i = 1; i < offsets.length; i += 1) {
    if (offsets[i]! - offsets[i - 1]! < DINO_OBSTACLE_MIN_GAP_MS) {
      offsets[i] = offsets[i - 1]! + DINO_OBSTACLE_MIN_GAP_MS;
    }
  }
  return offsets;
}

export type DinoJumpOutcome =
  | { accepted: false; reason: "WRONG_TEAM_PHASE" | "PLAYER_DEAD" }
  | { accepted: true; cleared: boolean; obstacleIndex: number | null; clearedCount: number };

/** 점프 수신 시각이 판정 창 안의 미클리어 장애물과 겹치면 클리어로 기록한다. */
export function applyDinoJump(room: RoomRecord, teamId: TeamId, playerId: PlayerId, now: number): DinoJumpOutcome {
  const team = room.state.teams[teamId];
  if (team.phase !== "ASSEMBLY") return { accepted: false, reason: "WRONG_TEAM_PHASE" };
  if (team.dinoRun.deadPlayerIds.includes(playerId)) return { accepted: false, reason: "PLAYER_DEAD" };

  const cleared = team.dinoRun.clearedByPlayer[playerId] ?? (team.dinoRun.clearedByPlayer[playerId] = []);
  const elapsed = now - team.phaseStartedAt;

  let hitIndex: number | null = null;
  for (let i = 0; i < team.dinoRun.obstacleOffsetsMs.length; i += 1) {
    if (cleared.includes(i)) continue;
    if (Math.abs(elapsed - team.dinoRun.obstacleOffsetsMs[i]!) <= DINO_JUMP_WINDOW_MS) {
      hitIndex = i;
      break;
    }
  }

  if (hitIndex !== null) {
    cleared.push(hitIndex);
    const player = room.state.players.find((p) => p.id === playerId);
    if (player) player.stats.dinoCleared += 1;
  }
  return { accepted: true, cleared: hitIndex !== null, obstacleIndex: hitIndex, clearedCount: cleared.length };
}

/**
 * 판정 창이 완전히 지났는데 클리어 못한 장애물이 하나라도 있으면 그 플레이어를 탈락시킨다
 * (1회 피격 = 탈락). 탈락한 플레이어는 이후 점프해도 인정되지 않지만, 남은 팀원과 30초
 * 타이머는 계속 진행된다.
 */
export function checkDinoDeaths(room: RoomRecord, teamId: TeamId, now: number): PlayerId[] {
  const team = room.state.teams[teamId];
  if (team.phase !== "ASSEMBLY") return [];

  const elapsed = now - team.phaseStartedAt;
  const newlyDead: PlayerId[] = [];
  for (const playerId of team.playerIds) {
    if (team.dinoRun.deadPlayerIds.includes(playerId)) continue;
    const cleared = team.dinoRun.clearedByPlayer[playerId] ?? [];
    const missedAnObstacle = team.dinoRun.obstacleOffsetsMs.some(
      (offsetMs, index) => !cleared.includes(index) && elapsed > offsetMs + DINO_JUMP_WINDOW_MS + DINO_DEATH_GRACE_MS,
    );
    if (missedAnObstacle) {
      team.dinoRun.deadPlayerIds.push(playerId);
      newlyDead.push(playerId);
    }
  }
  return newlyDead;
}

export function gradeForPerformance(performance: number): DinoRunGrade {
  if (performance >= DINO_GRADE_PERFECT) return "PERFECT";
  if (performance >= DINO_GRADE_GOOD) return "GOOD";
  if (performance >= DINO_GRADE_CLUMSY) return "CLUMSY";
  return "MESSY";
}

export type DinoFinishResult = { performance: number; grade: DinoRunGrade; startStability: number };

/**
 * 30초가 지났으면 팀 클리어율로 조립을 평가한다. 아직 CHARGING으로 넘기지는 않는다 —
 * 상대 팀도 끝나야 WIN/LOSE/DRAW가 정해지고, 그 뒤 대기 시간이 지나야 두 팀이 함께
 * 전환된다 (실제 전환은 RoomManager.tickDinoRunTransition이 처리).
 * 클리어율 = 팀 전체 클리어 수 ÷ (장애물 수 × 팀원 수) — 인원과 무관하게 공정하다.
 */
export function finishDinoRunIfNeeded(room: RoomRecord, teamId: TeamId, now: number): DinoFinishResult | null {
  const team = room.state.teams[teamId];
  if (team.phase !== "ASSEMBLY") return null;
  if (team.phaseEndsAt === null || now < team.phaseEndsAt) return null;
  // 이미 평가를 끝내고 상대 팀을 기다리는 중 — 매 틱마다 다시 평가하지 않는다.
  if (team.dinoRun.performance !== null) return null;

  const totalCleared = Object.values(team.dinoRun.clearedByPlayer).reduce((sum, list) => sum + list.length, 0);
  const possible = team.dinoRun.obstacleOffsetsMs.length * Math.max(1, team.playerIds.length);
  const performance = Math.min(1, totalCleared / possible);
  const grade = gradeForPerformance(performance);
  const startStability = Math.round(CHARGING_START_STABILITY_BASE + CHARGING_START_STABILITY_RANGE * performance);

  team.dinoRun.performance = performance;
  team.dinoRun.grade = grade;
  team.charging.stability = startStability;
  room.phaseDurations[teamId].assemblyMs = now - team.phaseStartedAt;

  return { performance, grade, startStability };
}
