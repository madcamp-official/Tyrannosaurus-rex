/** Plan.md §6.2. 골격 조립 다이노런: 시드 기반 장애물 스케줄과 서버 권위 점프 판정. */

import {
  CHARGING_DURATION_MS,
  CHARGING_START_STABILITY_BASE,
  CHARGING_START_STABILITY_RANGE,
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

/**
 * 라운드 시드로 장애물 오프셋을 생성한다. 양 팀이 같은 스케줄을 공유한다(§4 공정성).
 * 최소 간격을 지키기 위해 [MIN, MAX] 구간을 균등 분할한 뒤 시드 지터를 더한다.
 */
export function makeObstacleSchedule(seed: string): number[] {
  const span = DINO_OBSTACLE_MAX_OFFSET_MS - DINO_OBSTACLE_MIN_OFFSET_MS;
  const slot = span / DINO_OBSTACLE_COUNT;
  const jitterMax = Math.max(0, slot - DINO_OBSTACLE_MIN_GAP_MS);
  const offsets: number[] = [];
  for (let i = 0; i < DINO_OBSTACLE_COUNT; i += 1) {
    const jitter = seededRandom01(`${seed}:dino`, i) * jitterMax;
    offsets.push(Math.round(DINO_OBSTACLE_MIN_OFFSET_MS + i * slot + jitter));
  }
  return offsets;
}

export type DinoJumpOutcome =
  | { accepted: false; reason: "WRONG_TEAM_PHASE" }
  | { accepted: true; cleared: boolean; obstacleIndex: number | null; clearedCount: number };

/** 점프 수신 시각이 판정 창 안의 미클리어 장애물과 겹치면 클리어로 기록한다. */
export function applyDinoJump(room: RoomRecord, teamId: TeamId, playerId: PlayerId, now: number): DinoJumpOutcome {
  const team = room.state.teams[teamId];
  if (team.phase !== "ASSEMBLY") return { accepted: false, reason: "WRONG_TEAM_PHASE" };

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

export function gradeForPerformance(performance: number): DinoRunGrade {
  if (performance >= DINO_GRADE_PERFECT) return "PERFECT";
  if (performance >= DINO_GRADE_GOOD) return "GOOD";
  if (performance >= DINO_GRADE_CLUMSY) return "CLUMSY";
  return "MESSY";
}

export type DinoFinishResult = { performance: number; grade: DinoRunGrade; startStability: number };

/**
 * 30초가 지났으면 팀 클리어율로 조립을 평가하고 CHARGING으로 전환한다.
 * 클리어율 = 팀 전체 클리어 수 ÷ (장애물 수 × 팀원 수) — 인원과 무관하게 공정하다.
 */
export function finishDinoRunIfNeeded(room: RoomRecord, teamId: TeamId, now: number): DinoFinishResult | null {
  const team = room.state.teams[teamId];
  if (team.phase !== "ASSEMBLY") return null;
  if (team.phaseEndsAt === null || now < team.phaseEndsAt) return null;

  const totalCleared = Object.values(team.dinoRun.clearedByPlayer).reduce((sum, list) => sum + list.length, 0);
  const possible = team.dinoRun.obstacleOffsetsMs.length * Math.max(1, team.playerIds.length);
  const performance = Math.min(1, totalCleared / possible);
  const grade = gradeForPerformance(performance);
  const startStability = Math.round(CHARGING_START_STABILITY_BASE + CHARGING_START_STABILITY_RANGE * performance);

  team.dinoRun.performance = performance;
  team.dinoRun.grade = grade;

  room.phaseDurations[teamId].assemblyMs = now - team.phaseStartedAt;
  team.phase = "CHARGING";
  team.phaseStartedAt = now;
  team.phaseEndsAt = now + CHARGING_DURATION_MS;
  team.charging.stability = startStability;
  room.chargingStartedAt[teamId] = now;

  return { performance, grade, startStability };
}
