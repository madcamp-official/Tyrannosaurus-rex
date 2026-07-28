/**
 * Plan.md §6.2. 골격 조립 단계 — 다이노런(장애물 점프) 대신 하늘에서 떨어지는 운석을
 * 피하고 보너스 아이템을 잡는 미니게임. phase 이름(ASSEMBLY)과 타입 이름(DinoRunState 등)은
 * 리네임 범위를 줄이기 위해 그대로 두고 내부 메커닉만 교체했다.
 */

import {
  CHARGING_DURATION_MS,
  CHARGING_START_STABILITY_BASE,
  CHARGING_START_STABILITY_RANGE,
  DINO_GRADE_CLUMSY,
  DINO_GRADE_GOOD,
  DINO_GRADE_PERFECT,
  METEOR_BONUS_SCORE_REWARD,
  METEOR_DODGE_LIVES,
  METEOR_DODGE_REFERENCE_SCORE_PER_PLAYER,
  METEOR_HIT_SCORE_PENALTY,
  SKY_OBJECT_BONUS_CHANCE,
  SKY_OBJECT_COLLISION_RADIUS,
  SKY_OBJECT_COUNT,
  SKY_OBJECT_DENSITY_CURVE_EXPONENT,
  SKY_OBJECT_MAX_OFFSET_MS,
  SKY_OBJECT_MIN_GAP_MS,
  SKY_OBJECT_MIN_OFFSET_MS,
  type DinoPositionInput,
  type DinoRunGrade,
  type PlayerId,
  type SkyObject,
  type TeamId,
} from "@trex/shared";
import type { RoomRecord } from "../rooms/RoomManager.js";
import { seededRandom01 } from "./seededRandom.js";

/**
 * 라운드 시드로 낙하 오브젝트 스케줄을 생성한다. 양 팀이 같은 스케줄을 공유한다(§4 공정성).
 * [MIN, MAX] 구간에 지터를 섞어 뿌리되, 지수(SKY_OBJECT_DENSITY_CURVE_EXPONENT < 1)로
 * 시간축을 휘어 초반엔 뜸하고 후반으로 갈수록 점점 빽빽해지게 만든 뒤, 최소 간격 미만이면
 * 뒤로 밀어 보정하고, 각 오브젝트의 좌우 위치·종류(운석/보너스)를 시드 기반으로 정한다.
 */
export function makeSkyObjectSchedule(seed: string): SkyObject[] {
  const span = SKY_OBJECT_MAX_OFFSET_MS - SKY_OBJECT_MIN_OFFSET_MS;
  const offsets: number[] = [];
  for (let i = 0; i < SKY_OBJECT_COUNT; i += 1) {
    const t = Math.pow(i / (SKY_OBJECT_COUNT - 1), SKY_OBJECT_DENSITY_CURVE_EXPONENT);
    const jitter = (seededRandom01(`${seed}:sky`, i) - 0.5) * SKY_OBJECT_MIN_GAP_MS * 0.6;
    offsets.push(Math.round(SKY_OBJECT_MIN_OFFSET_MS + span * t + jitter));
  }
  for (let i = 1; i < offsets.length; i += 1) {
    if (offsets[i]! - offsets[i - 1]! < SKY_OBJECT_MIN_GAP_MS) {
      offsets[i] = offsets[i - 1]! + SKY_OBJECT_MIN_GAP_MS;
    }
  }
  return offsets.map((hitAtMs, i) => {
    const x = seededRandom01(`${seed}:skyX`, i);
    const kind = seededRandom01(`${seed}:skyKind`, i) < SKY_OBJECT_BONUS_CHANCE ? "BONUS" : "METEOR";
    return { id: i, hitAtMs, x, kind };
  });
}

/** 플레이어의 좌우 위치를 최신값으로 기록한다 (조준과 같은 패턴 — 고빈도, 상태만 갱신). */
export function applyDinoPosition(
  room: RoomRecord,
  teamId: TeamId,
  playerId: PlayerId,
  input: DinoPositionInput,
  now: number,
): boolean {
  const team = room.state.teams[teamId];
  if (team.phase !== "ASSEMBLY") return false;
  if (team.dinoRun.deadPlayerIds.includes(playerId)) return false;
  const existing = room.dinoPositionState.get(playerId);
  if (existing && input.seq <= existing.lastSeq) return false;
  room.dinoPositionState.set(playerId, { x: input.x, lastSeq: input.seq, receivedAt: now });
  return true;
}

export type SkyCollisionEvent =
  | { kind: "HIT"; playerId: PlayerId; objectId: number; livesLeft: number; score: number; x: number }
  | { kind: "BONUS"; playerId: PlayerId; objectId: number; score: number; x: number }
  | { kind: "DEATH"; playerId: PlayerId };

/**
 * 낙하 시각이 지났지만 아직 판정 안 한 오브젝트를 팀원별로 판정한다. 운석에 맞으면 목숨을
 * 깎고 점수를 감점, 목숨이 0이 되면 탈락시킨다(§METEOR_DODGE_LIVES). 보너스를 잡으면
 * 점수를 더한다. 판정은 플레이어의 가장 최근 위치(dino:position) 기준이며, 위치를 한
 * 번도 안 보낸 플레이어는 화면 중앙(0.5)에 있다고 본다.
 */
export function tickSkyCollisions(room: RoomRecord, teamId: TeamId, now: number): SkyCollisionEvent[] {
  const team = room.state.teams[teamId];
  if (team.phase !== "ASSEMBLY") return [];

  const elapsed = now - team.phaseStartedAt;
  const events: SkyCollisionEvent[] = [];

  for (const obj of team.dinoRun.skyObjects) {
    if (elapsed < obj.hitAtMs) continue;
    for (const playerId of team.playerIds) {
      if (team.dinoRun.deadPlayerIds.includes(playerId)) continue;
      const resolved =
        team.dinoRun.resolvedObjectIdsByPlayer[playerId] ?? (team.dinoRun.resolvedObjectIdsByPlayer[playerId] = []);
      if (resolved.includes(obj.id)) continue;
      resolved.push(obj.id);

      const playerX = room.dinoPositionState.get(playerId)?.x ?? 0.5;
      const overlap = Math.abs(playerX - obj.x) <= SKY_OBJECT_COLLISION_RADIUS;
      const player = room.state.players.find((p) => p.id === playerId);

      if (obj.kind === "METEOR") {
        if (!overlap) {
          // 성공적으로 피함 — MVP 집계용 카운터만 올린다(브로드캐스트할 만한 이벤트는 아님).
          if (player) player.stats.dinoCleared += 1;
          continue;
        }
        const livesLeft = Math.max(0, (team.dinoRun.livesByPlayer[playerId] ?? METEOR_DODGE_LIVES) - 1);
        team.dinoRun.livesByPlayer[playerId] = livesLeft;
        const score = (team.dinoRun.scoreByPlayer[playerId] ?? 0) - METEOR_HIT_SCORE_PENALTY;
        team.dinoRun.scoreByPlayer[playerId] = score;
        events.push({ kind: "HIT", playerId, objectId: obj.id, livesLeft, score, x: obj.x });
        if (livesLeft <= 0) {
          team.dinoRun.deadPlayerIds.push(playerId);
          events.push({ kind: "DEATH", playerId });
        }
      } else {
        if (!overlap) continue; // 보너스는 못 잡아도 페널티 없음 — 조용히 지나간다.
        if (player) player.stats.dinoCleared += 1;
        const score = (team.dinoRun.scoreByPlayer[playerId] ?? 0) + METEOR_BONUS_SCORE_REWARD;
        team.dinoRun.scoreByPlayer[playerId] = score;
        events.push({ kind: "BONUS", playerId, objectId: obj.id, score, x: obj.x });
      }
    }
  }
  return events;
}

export function gradeForPerformance(performance: number): DinoRunGrade {
  if (performance >= DINO_GRADE_PERFECT) return "PERFECT";
  if (performance >= DINO_GRADE_GOOD) return "GOOD";
  if (performance >= DINO_GRADE_CLUMSY) return "CLUMSY";
  return "MESSY";
}

export type DinoFinishResult = { performance: number; grade: DinoRunGrade; startStability: number };

/**
 * 1분이 지났으면 팀 점수 합을 정규화해 성능(0~1)을 평가한다. 아직 CHARGING으로 넘기지는
 * 않는다 — 상대 팀도 끝나야 WIN/LOSE/DRAW가 정해지고, 그 뒤 대기 시간이 지나야 두 팀이
 * 함께 CHARGING_PRACTICE(영점 조정 연습)로 전환된다 (실제 전환은
 * RoomManager.tickDinoRunTransition이 처리). 성능 = 팀 점수 합 ÷ (인원수 ×
 * METEOR_DODGE_REFERENCE_SCORE_PER_PLAYER) — 인원과 무관하게 공정하다.
 */
export function finishDinoRunIfNeeded(room: RoomRecord, teamId: TeamId, now: number): DinoFinishResult | null {
  const team = room.state.teams[teamId];
  if (team.phase !== "ASSEMBLY") return null;
  if (team.phaseEndsAt === null || now < team.phaseEndsAt) return null;
  // 이미 평가를 끝내고 상대 팀을 기다리는 중 — 매 틱마다 다시 평가하지 않는다.
  if (team.dinoRun.performance !== null) return null;

  const totalScore = Object.values(team.dinoRun.scoreByPlayer).reduce((sum, score) => sum + score, 0);
  const referenceMax = METEOR_DODGE_REFERENCE_SCORE_PER_PLAYER * Math.max(1, team.playerIds.length);
  const performance = Math.min(1, Math.max(0, totalScore / referenceMax));
  const grade = gradeForPerformance(performance);
  const startStability = Math.round(CHARGING_START_STABILITY_BASE + CHARGING_START_STABILITY_RANGE * performance);

  team.dinoRun.performance = performance;
  team.dinoRun.grade = grade;
  team.charging.stability = startStability;
  room.phaseDurations[teamId].assemblyMs = now - team.phaseStartedAt;

  return { performance, grade, startStability };
}

/**
 * 영점 조정 연습(CHARGING_PRACTICE_DURATION_MS)이 끝난 팀을 실제 CHARGING으로 전환한다.
 * 사격(energy:fire)은 이 전환 이후에만 서버에서 인정된다.
 */
export function finishChargingPracticeIfNeeded(room: RoomRecord, teamId: TeamId, now: number): boolean {
  const team = room.state.teams[teamId];
  if (team.phase !== "CHARGING_PRACTICE") return false;
  if (team.phaseEndsAt === null || now < team.phaseEndsAt) return false;

  team.phase = "CHARGING";
  team.phaseStartedAt = now;
  team.phaseEndsAt = now + CHARGING_DURATION_MS;
  room.chargingStartedAt[teamId] = now;
  // 공유 스켈레톤은 방에서 먼저 CHARGING에 들어간 팀 기준으로 한 번만 시작된다 (§2.3).
  if (room.sharedTrexStartedAt === null) {
    room.sharedTrexStartedAt = now;
  }
  return true;
}
