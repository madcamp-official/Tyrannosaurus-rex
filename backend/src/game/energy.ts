/** Plan.md §6.3, §17.10, §3. 서버 권위 사격 판정과 정상·와이라노 상태 전환. */

import {
  AIM_STALE_MS,
  ENERGY_TARGET,
  FINAL_STAGE_CORE_TIMEOUT_MS,
  PHASE_START_GRACE_MS,
  SHOT_COOLDOWN_MS,
  STABILITY_TARGET,
  type HitZone,
  type ChargingStage,
  type PlayerId,
  type TeamId,
  type TeamPhase,
} from "@trex/shared";
import type { RoomRecord } from "../rooms/RoomManager.js";
import { advanceActiveCore, computeActiveCore, computeChargingStage, computeTrexTransform, CORE_OFFSETS, resolveStageHit } from "./charging.js";

export type ShotTracking = { lastShotAt: number; recentShotIds: Set<string> };

const MAX_TRACKED_SHOT_IDS = 32;

export function createShotTracking(): ShotTracking {
  return { lastShotAt: 0, recentShotIds: new Set() };
}

export type EnergyFireOutcome = {
  accepted: boolean;
  reason?: "WRONG_TEAM_PHASE" | "SHOT_COOLDOWN" | "FINAL_STAGE_STUNNED" | "DUPLICATE_REQUEST" | "INVALID_PAYLOAD";
  hit: boolean;
  hitZone: HitZone | null;
  energyDelta: number;
  stabilityDelta: number;
  energyAfter: number;
  stabilityAfter: number;
  teamPhaseAfter: TeamPhase;
  aimPoint: { x: number; y: number } | null;
  hitPoint: { x: number; y: number } | null;
  /** REVIVED에 새로 도달했다면(정상 또는 와이라노 확정) true. 룸 승패 확정 처리를 트리거한다. */
  justReachedRevived: boolean;
  coreChanged: { from: "HEART" | "SKULL" | "SPINE"; to: "HEART" | "SKULL" | "SPINE" } | null;
  chargingStage: ChargingStage;
};

function rejectOutcome(reason: NonNullable<EnergyFireOutcome["reason"]>, team: { phase: TeamPhase }): EnergyFireOutcome {
  return {
    accepted: false,
    reason,
    hit: false,
    hitZone: null,
    energyDelta: 0,
    stabilityDelta: 0,
    energyAfter: 0,
    stabilityAfter: 0,
    teamPhaseAfter: team.phase,
    aimPoint: null,
    hitPoint: null,
    justReachedRevived: false,
    coreChanged: null,
    chargingStage: 1,
  };
}

export function applyEnergyFire(
  room: RoomRecord,
  teamId: TeamId,
  playerId: PlayerId,
  shotId: string,
  now: number,
): EnergyFireOutcome {
  const team = room.state.teams[teamId];
  if (team.phase !== "CHARGING") {
    return rejectOutcome("WRONG_TEAM_PHASE", team);
  }
  if (now < team.phaseStartedAt + PHASE_START_GRACE_MS) {
    return rejectOutcome("WRONG_TEAM_PHASE", team);
  }
  if (team.charging.finalStunnedUntil && now < team.charging.finalStunnedUntil) {
    return rejectOutcome("FINAL_STAGE_STUNNED", team);
  }

  let tracking = room.shotTracking.get(playerId);
  if (!tracking) {
    tracking = createShotTracking();
    room.shotTracking.set(playerId, tracking);
  }
  if (tracking.recentShotIds.has(shotId)) return rejectOutcome("DUPLICATE_REQUEST", team);
  if (now - tracking.lastShotAt < SHOT_COOLDOWN_MS) return rejectOutcome("SHOT_COOLDOWN", team);

  const aim = room.aimState.get(playerId);
  if (!aim || now - aim.receivedAt > AIM_STALE_MS) return rejectOutcome("INVALID_PAYLOAD", team);

  tracking.lastShotAt = now;
  tracking.recentShotIds.add(shotId);
  if (tracking.recentShotIds.size > MAX_TRACKED_SHOT_IDS) {
    const oldest = tracking.recentShotIds.values().next().value;
    if (oldest !== undefined) tracking.recentShotIds.delete(oldest);
  }

  const trex = computeTrexTransform(room, now);
  const { core } = computeActiveCore(room, now);
  const chargingStage = computeChargingStage(room, teamId, now);
  const { hitZone, energyDelta, stabilityDelta } = resolveStageHit(aim.point, trex.position, core, chargingStage);
  const isCoreHit = hitZone === "HEART" || hitZone === "SKULL" || hitZone === "SPINE";

  const stageEnergyCeiling = chargingStage === 1 ? 80 : chargingStage === 2 ? 160 : ENERGY_TARGET;
  team.charging.energy = Math.max(0, Math.min(stageEnergyCeiling, team.charging.energy + energyDelta));
  team.charging.stability = Math.max(0, Math.min(STABILITY_TARGET, team.charging.stability + stabilityDelta));

  const player = room.state.players.find((p) => p.id === playerId);
  if (player) {
    player.stats.shots += 1;
    if (hitZone !== null) {
      player.stats.hits += 1;
      player.stats.energyContributed += energyDelta;
      if (isCoreHit) player.stats.coreHits += 1;
    }
  }

  const coreChanged = isCoreHit ? advanceActiveCore(room) : null;
  if (isCoreHit && chargingStage === 3) {
    team.charging.finalCoreDeadlineAt = now + FINAL_STAGE_CORE_TIMEOUT_MS;
  }
  if (coreChanged) {
    for (const stateTeam of Object.values(room.state.teams)) {
      stateTeam.charging.activeCore = coreChanged.to;
      stateTeam.charging.coreChangesAt = 0;
    }
  }

  let justReachedRevived = false;

  if (team.charging.energy >= ENERGY_TARGET) {
    team.charging.form = "NORMAL";
    team.phase = "REVIVED";
    justReachedRevived = true;
  }

  return {
    accepted: true,
    hit: hitZone !== null,
    hitZone,
    energyDelta,
    stabilityDelta,
    energyAfter: team.charging.energy,
    stabilityAfter: team.charging.stability,
    teamPhaseAfter: team.phase,
    aimPoint: aim.point,
    hitPoint: isCoreHit
      ? { x: trex.position.x + CORE_OFFSETS[core].x, y: trex.position.y + CORE_OFFSETS[core].y }
      : hitZone === "BONE" ? trex.position : null,
    justReachedRevived,
    coreChanged,
    chargingStage,
  };
}

/** CHARGING 제한 시간(90초)이 지났는데 에너지를 못 채웠으면 와이라노로 REVIVED가 확정된다 (되돌릴 수 없음). */
export function expireChargingIfNeeded(room: RoomRecord, teamId: TeamId, now: number): "TO_REVIVED_YRANNO" | null {
  const team = room.state.teams[teamId];
  if (team.phase !== "CHARGING") return null;
  if (team.phaseEndsAt === null || now < team.phaseEndsAt) return null;

  team.phase = "REVIVED";
  team.charging.form = "YRANNO";
  return "TO_REVIVED_YRANNO";
}
