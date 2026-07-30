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
  METEOR_DODGE_LIVES,
  METEOR_DODGE_REFERENCE_SCORE_PER_PLAYER,
  METEOR_FRUIT_SCORE_REWARD,
  METEOR_HEART_LIVES_RESTORED,
  METEOR_HEART_SCORE_REWARD,
  METEOR_HIT_SCORE_PENALTY,
  PHASE_START_GRACE_MS,
  SKY_OBJECT_COLLISION_RADIUS,
  SKY_OBJECT_COLLISION_GRACE_MS,
  SKY_OBJECT_COUNT,
  SKY_OBJECT_DENSITY_CURVE_EXPONENT,
  SKY_OBJECT_FALL_MS,
  SKY_OBJECT_FRUIT_CHANCE,
  SKY_OBJECT_HEART_CHANCE,
  SKY_OBJECT_MAX_OFFSET_MS,
  SKY_OBJECT_MIN_GAP_MS,
  SKY_OBJECT_MIN_OFFSET_MS,
  type DinoPositionInput,
  type DinoRunGrade,
  type PlayerId,
  type SkyObject,
  type SkyObjectKind,
  type TeamId,
} from "@trex/shared";
import type { RoomRecord } from "../rooms/RoomManager.js";
import { seededRandom01 } from "./seededRandom.js";

/**
 * 라운드 시드로 낙하 오브젝트 스케줄을 생성한다. 양 팀이 같은 스케줄을 공유한다(§4 공정성).
 * [MIN, MAX] 구간에 지터를 섞어 뿌리되, 약한 후반 가속 곡선을 적용한다. 초반에도 충분한
 * 오브젝트가 나오면서 후반에만 과도하게 겹치지 않도록 하고, 최소 간격 미만이면 뒤로 밀어
 * 보정한 뒤 각 오브젝트의 좌우 위치·종류(운석/과일/하트)를 시드 기반으로 정한다.
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
    const roll = seededRandom01(`${seed}:skyKind`, i);
    const kind: SkyObjectKind = roll < SKY_OBJECT_HEART_CHANCE ? "HEART" : roll < SKY_OBJECT_HEART_CHANCE + SKY_OBJECT_FRUIT_CHANCE ? "FRUIT" : "METEOR";
    return { id: i, hitAtMs, x, kind };
  });
}

// positionNearTime이 "낙하 순간의 위치"를 되짚어볼 수 있을 만큼만 이력을 들고 있는다 —
// SKY_OBJECT_COLLISION_GRACE_MS(유예 판정 창)보다 넉넉히 길게 잡아 여유를 둔다.
const POSITION_HISTORY_WINDOW_MS = 600;

/** 플레이어의 좌우 위치를 최신값 + 짧은 이력으로 기록한다 (조준과 같은 패턴 — 고빈도, 상태만 갱신). */
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
  const history = existing?.history ?? [];
  history.push({ x: input.x, receivedAt: now });
  while (history.length > 1 && now - history[0]!.receivedAt > POSITION_HISTORY_WINDOW_MS) history.shift();
  room.dinoPositionState.set(playerId, { x: input.x, lastSeq: input.seq, receivedAt: now, history });
  return true;
}

/**
 * 운석 명중 판정은 "낙하 순간(targetTime)에 실제로 그 자리에 있었는가"를 물어야 한다 — 판정을
 * 유예 시간만큼 늦춰서 그 시점의 "최신" 위치를 쓰면, 착지 순간엔 피했다가 유예 시간 안에 다시
 * 그 자리로 걸어 들어온 경우까지 "위에서 맞은 것"으로 잘못 판정된다. 이력 중 targetTime과
 * 가장 가까운 시각에 보고된 위치를 골라 그 문제를 없앤다(동률이면 더 최근 보고를 우선한다 —
 * 네트워크 지연으로 착지 시각 직후에야 도착한 보고가 실제로는 착지 순간의 위치를 담고 있을 수
 * 있기 때문이다).
 */
function positionNearTime(room: RoomRecord, playerId: PlayerId, targetTime: number): number {
  const state = room.dinoPositionState.get(playerId);
  if (!state || state.history.length === 0) return 0.5;
  let best = state.history[0]!;
  let bestDiff = Math.abs(best.receivedAt - targetTime);
  for (const sample of state.history) {
    const diff = Math.abs(sample.receivedAt - targetTime);
    if (diff <= bestDiff) {
      best = sample;
      bestDiff = diff;
    }
  }
  return best.x;
}

export type SkyCollisionEvent =
  | { kind: "HIT"; playerId: PlayerId; objectId: number; livesLeft: number; score: number; x: number }
  | {
      kind: "BONUS";
      playerId: PlayerId;
      objectId: number;
      pickupKind: "FRUIT" | "HEART";
      livesLeft: number;
      score: number;
      x: number;
    }
  | { kind: "DEATH"; playerId: PlayerId }
  // 운석이 플레이어를 "따라다니다 떨어지는" 목표 좌표가 확정되는 순간을 알린다. 모바일
  // 클라이언트가 이 값 없이 자체적으로 낙하 애니메이션 시작 시점의 로컬 좌표를 목표로
  // 추정하면, 서버가 실제로 잠근 시각(100ms 배경 틱 기준)과 클라이언트 렌더링 시각이
  // 미묘하게 어긋나 화면상 안 맞은 것처럼 보이는데 서버는 맞았다고 판정하는 불일치가
  // 생긴다. 서버가 잠근 값을 그대로 내려줘 시각적 위치와 판정 위치를 항상 일치시킨다.
  | { kind: "LOCK"; playerId: PlayerId; objectId: number; x: number };

/**
 * 낙하 시각이 지났지만 아직 판정 안 한 오브젝트를 팀원별로 판정한다. 운석에 맞으면 목숨을
 * 깎고 점수를 감점, 목숨이 0이 되면 탈락시킨다(§METEOR_DODGE_LIVES). 과일을 잡으면 점수를
 * 더하고, 하트를 잡으면 점수와 함께 목숨도 회복한다(METEOR_DODGE_LIVES 초과로는 안 찬다).
 * 판정은 플레이어의 가장 최근 위치(dino:position) 기준이며, 위치를 한 번도 안 보낸
 * 플레이어는 화면 중앙(0.5)에 있다고 본다.
 *
 * 운석은 "공룡을 따라다니다 떨어지는" 느낌을 주기 위해, 낙하가 시작되는 시각(스폰 시각 =
 * hitAtMs - SKY_OBJECT_FALL_MS)에 플레이어가 있던 좌우 위치를 목표로 고정한다 — 그 뒤로
 * 플레이어가 움직이면 고정된 지점에서 벗어나 피할 수 있다. 과일·하트는 기존처럼 셔플된
 * 고정 좌표(obj.x)를 그대로 쓴다(잡으려면 그 자리로 이동해야 한다).
 */
export function tickSkyCollisions(room: RoomRecord, teamId: TeamId, now: number): SkyCollisionEvent[] {
  const team = room.state.teams[teamId];
  if (team.phase !== "ASSEMBLY") return [];

  const elapsed = now - team.phaseStartedAt - PHASE_START_GRACE_MS;
  // 준비 카운트다운 동안에는 모바일 조작값이 아직 없으므로 충돌을 판정하지 않는다.
  // 이후의 오브젝트 스케줄도 실제 게임 시작 시점을 기준으로 계산한다.
  if (elapsed < 0) return [];
  const events: SkyCollisionEvent[] = [];

  for (const obj of team.dinoRun.skyObjects) {
    if (obj.kind !== "METEOR") continue;
    if (elapsed < obj.hitAtMs - SKY_OBJECT_FALL_MS) continue;
    for (const playerId of team.playerIds) {
      if (team.dinoRun.deadPlayerIds.includes(playerId)) continue;
      const key = `${playerId}:${obj.id}`;
      if (room.dinoMeteorLockState.has(key)) continue;
      const lockedX = room.dinoPositionState.get(playerId)?.x ?? 0.5;
      room.dinoMeteorLockState.set(key, lockedX);
      events.push({ kind: "LOCK", playerId, objectId: obj.id, x: lockedX });
    }
  }

  for (const obj of team.dinoRun.skyObjects) {
    if (elapsed < obj.hitAtMs + SKY_OBJECT_COLLISION_GRACE_MS) continue;
    for (const playerId of team.playerIds) {
      if (team.dinoRun.deadPlayerIds.includes(playerId)) continue;
      const resolved =
        team.dinoRun.resolvedObjectIdsByPlayer[playerId] ?? (team.dinoRun.resolvedObjectIdsByPlayer[playerId] = []);
      if (resolved.includes(obj.id)) continue;
      resolved.push(obj.id);

      // 운석은 "낙하 순간에 실제로 그 자리에 있었는지"로 판정한다(위에서 맞았을 때만 인정) —
      // 유예 시간 동안 늦게 들어온 최신 위치를 그대로 쓰면, 착지 순간엔 피했다가 그 뒤 유예
      // 시간 안에 다시 걸어 들어온 경우도 맞은 것으로 오판할 수 있다. 과일·하트는 그대로
      // "판정 시점의 최신 위치"를 쓴다 — 보상이라 조금 늦게 자리를 잡아도 관대하게 인정한다.
      const targetTime = team.phaseStartedAt + PHASE_START_GRACE_MS + obj.hitAtMs;
      const playerX =
        obj.kind === "METEOR" ? positionNearTime(room, playerId, targetTime) : (room.dinoPositionState.get(playerId)?.x ?? 0.5);
      const targetX = obj.kind === "METEOR" ? (room.dinoMeteorLockState.get(`${playerId}:${obj.id}`) ?? obj.x) : obj.x;
      const overlap = Math.abs(playerX - targetX) <= SKY_OBJECT_COLLISION_RADIUS;
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
        events.push({ kind: "HIT", playerId, objectId: obj.id, livesLeft, score, x: targetX });
        if (livesLeft <= 0) {
          team.dinoRun.deadPlayerIds.push(playerId);
          events.push({ kind: "DEATH", playerId });
        }
      } else {
        if (!overlap) continue; // 과일·하트는 못 잡아도 페널티 없음 — 조용히 지나간다.
        if (player) player.stats.dinoCleared += 1;
        const livesBefore = team.dinoRun.livesByPlayer[playerId] ?? METEOR_DODGE_LIVES;
        const livesLeft = obj.kind === "HEART" ? Math.min(METEOR_DODGE_LIVES, livesBefore + METEOR_HEART_LIVES_RESTORED) : livesBefore;
        team.dinoRun.livesByPlayer[playerId] = livesLeft;
        const reward = obj.kind === "HEART" ? METEOR_HEART_SCORE_REWARD : METEOR_FRUIT_SCORE_REWARD;
        const score = (team.dinoRun.scoreByPlayer[playerId] ?? 0) + reward;
        team.dinoRun.scoreByPlayer[playerId] = score;
        events.push({ kind: "BONUS", playerId, objectId: obj.id, pickupKind: obj.kind, livesLeft, score, x: targetX });
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
  room.phaseDurations[teamId].assemblyMs = now - team.phaseStartedAt - PHASE_START_GRACE_MS;

  return { performance, grade, startStability };
}

/**
 * 영점 조정 연습(CHARGING_PRACTICE_DURATION_MS) 중인 팀을 실제 CHARGING으로 전환한다.
 * 팀원 전원이 영점을 먼저 잡더라도 안내된 연습 시간을 끝까지 유지한다.
 * 사격(energy:fire)은 이 전환 이후에만 서버에서 인정된다.
 */
export function finishChargingPracticeIfNeeded(room: RoomRecord, teamId: TeamId, now: number): boolean {
  const team = room.state.teams[teamId];
  if (team.phase !== "CHARGING_PRACTICE") return false;
  if (team.phaseEndsAt === null) return false;
  if (now < team.phaseStartedAt + PHASE_START_GRACE_MS) return false;

  // 모든 플레이어가 먼저 영점을 맞췄더라도 연습 화면은 정해진 15초 동안 유지한다.
  if (now < team.phaseEndsAt) return false;

  team.phase = "CHARGING";
  team.phaseStartedAt = now;
  // 과녁판에서 이미 조작법과 영점을 익혔으므로 별도 준비 화면 없이 바로 사격을 시작한다.
  team.phaseEndsAt = now + CHARGING_DURATION_MS;
  room.chargingStartedAt[teamId] = now;
  // 공유 스켈레톤은 방에서 먼저 CHARGING에 들어간 팀 기준으로 한 번만 시작된다 (§2.3).
  if (room.sharedTrexStartedAt === null) {
    room.sharedTrexStartedAt = now;
  }
  return true;
}
