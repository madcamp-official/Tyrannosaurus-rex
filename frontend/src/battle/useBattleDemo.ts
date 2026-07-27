/** 목업 데이터로 자동 재생되는 데모 모드. 티라노 좌우 배회 + 랜덤 명중 이벤트. */

import { useEffect, useRef } from "react";
import type { BattlePlayer, BattleState } from "./battleTypes";
import { useBattleController } from "./useBattleController";

const TREX_LOOP_MS = 15000;
// 좌우 사이드 스코어보드(폭 430px, 무대 22.4%)에 가려지지 않도록 안쪽 구간만 배회한다.
const TREX_RANGE: [number, number] = [0.28, 0.72];
const ENERGY_TARGET = 100;
const ROUND_SEC = 180;
const RESET_DELAY_MS = 3200;

// 코어는 실제 게임과 마찬가지로 항상 심장 위치에 고정된다.
const CORE_NAME = "심장";
const CORE_OFFSET = { dx: 0, dy: 0.01 };

const TREX_BASELINE_Y = 0.56;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function makePlayer(id: string, name: string): BattlePlayer {
  return { id, name, shots: 0, hits: 0, energy: 0 };
}

function initialBattle(): BattleState {
  return {
    remainingSec: ROUND_SEC,
    coreName: CORE_NAME,
    stage: 1,
    siteName: "노을 협곡 발굴지",
    energyTarget: ENERGY_TARGET,
    teamA: {
      energy: 0,
      totalHits: 0,
      coreHits: 0,
      players: [makePlayer("a1", "화염랩터"), makePlayer("a2", "골드팽"), makePlayer("a3", "선라이더"), makePlayer("a4", "엠버울프")],
    },
    teamB: {
      energy: 0,
      totalHits: 0,
      coreHits: 0,
      players: [makePlayer("b1", "프로스트핀"), makePlayer("b2", "아이스팽"), makePlayer("b3", "글레이셔"), makePlayer("b4", "블루레이")],
    },
    trex: { x: TREX_RANGE[0], facing: 1, corePos: corePosFor(TREX_RANGE[0], 1) },
  };
}

function trexXAt(elapsedMs: number): { x: number; facing: 1 | -1 } {
  const phase = (elapsedMs % TREX_LOOP_MS) / TREX_LOOP_MS;
  const [lo, hi] = TREX_RANGE;
  if (phase < 0.5) return { x: lo + (hi - lo) * (phase * 2), facing: 1 };
  return { x: hi - (hi - lo) * ((phase - 0.5) * 2), facing: -1 };
}

function corePosFor(trexX: number, facing: 1 | -1): [number, number] {
  return [clamp01(trexX + CORE_OFFSET.dx * facing), clamp01(TREX_BASELINE_Y + CORE_OFFSET.dy)];
}

function stageFor(avgEnergy: number): number {
  if (avgEnergy >= 75) return 4;
  if (avgEnergy >= 50) return 3;
  if (avgEnergy >= 25) return 2;
  return 1;
}

export function useBattleDemo() {
  const { battle, shotEvents, update, fireShot } = useBattleController(initialBattle());
  const startRef = useRef(Date.now());
  const resettingRef = useRef(false);

  // 타이머 + 티라노 이동(200ms 틱)
  useEffect(() => {
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const { x, facing } = trexXAt(elapsed);
      update((prev) => {
        if (resettingRef.current) return prev;
        const nextRemaining = Math.max(0, prev.remainingSec - 0.2);
        const avgEnergy = (prev.teamA.energy + prev.teamB.energy) / 2;
        return {
          ...prev,
          remainingSec: nextRemaining,
          stage: stageFor(avgEnergy),
          trex: { x, facing, corePos: corePosFor(x, facing) },
        };
      });
    }, 200);
    return () => window.clearInterval(tick);
  }, [update]);

  // 랜덤 명중 이벤트
  useEffect(() => {
    let cancelled = false;
    let timeoutId: number;

    const scheduleNext = () => {
      const delay = 350 + Math.random() * 450;
      timeoutId = window.setTimeout(fireRandomShot, delay);
    };

    const fireRandomShot = () => {
      if (cancelled) return;
      update((prev) => {
        if (resettingRef.current) return prev;
        const teamKey = Math.random() < 0.5 ? "teamA" : "teamB";
        const team = prev[teamKey];
        const playerIdx = Math.floor(Math.random() * team.players.length);
        const player = team.players[playerIdx]!;
        const isHit = Math.random() < 0.68;
        const isCore = isHit && Math.random() < 0.32;
        const gain = isCore ? 8 : isHit ? 3 : 0;

        const nextPlayers = team.players.map((p, i) =>
          i === playerIdx ? { ...p, shots: p.shots + 1, hits: p.hits + (isHit ? 1 : 0), energy: p.energy + gain } : p,
        );
        const nextTeam = {
          players: nextPlayers,
          energy: Math.min(prev.energyTarget, team.energy + gain),
          totalHits: team.totalHits + (isHit ? 1 : 0),
          coreHits: team.coreHits + (isCore ? 1 : 0),
        };

        const jitter = () => (Math.random() - 0.5) * 0.05;
        const point: [number, number] = isCore
          ? prev.trex.corePos
          : [clamp01(prev.trex.x + jitter()), clamp01(TREX_BASELINE_Y + jitter())];

        fireShot({ team: teamKey === "teamA" ? "A" : "B", playerId: player.id, hit: isHit, core: isCore, point });

        const reachedTarget = nextTeam.energy >= prev.energyTarget;
        if (reachedTarget && !resettingRef.current) {
          resettingRef.current = true;
          window.setTimeout(() => {
            startRef.current = Date.now();
            resettingRef.current = false;
            update(initialBattle());
          }, RESET_DELAY_MS);
        }

        return { ...prev, [teamKey]: nextTeam };
      });
      scheduleNext();
    };

    scheduleNext();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [update, fireShot]);

  return { battle, shotEvents };
}
