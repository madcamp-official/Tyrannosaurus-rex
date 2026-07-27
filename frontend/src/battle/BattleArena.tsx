/** 풀블리드 3D 무대 근사: 황혼 배경, 배회하는 스켈레톤 트리라노, 코어 마커, 크로스헤어, 레이저. */

import { useEffect, useMemo, useState } from "react";
import type { BattleShotEvent, BattleState, TeamId } from "./battleTypes";
import { GUN_MUZZLE, STAGE_H, STAGE_W } from "./battleLayout";

type Dust = { left: number; size: number; duration: number; delay: number };

function useDustParticles(count: number): Dust[] {
  return useMemo(
    () =>
      Array.from({ length: count }, () => ({
        left: Math.random() * 100,
        size: 2 + Math.random() * 4,
        duration: 8 + Math.random() * 10,
        delay: -Math.random() * 18,
      })),
    [count],
  );
}

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

interface AllPlayer {
  id: string;
  team: TeamId;
  index: number;
}

function useAimPoints(players: AllPlayer[], trexX: number, coreY: number) {
  const [points, setPoints] = useState<Record<string, [number, number]>>({});

  useEffect(() => {
    const roll = () => {
      setPoints((prev) => {
        const next = { ...prev };
        const perTeamCount: Record<string, number> = {};
        for (const p of players) perTeamCount[p.team] = (perTeamCount[p.team] ?? 0) + 1;

        for (const p of players) {
          const bias = p.team === "A" ? -0.05 : 0.05;
          const count = perTeamCount[p.team] ?? 1;
          // 팀별로 슬롯을 원형으로 분산 배치해 겹침을 줄이고, 약간의 흔들림만 랜덤으로 준다.
          const angle = (p.index / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
          const radius = 0.05 + Math.random() * 0.015;
          const dx = Math.cos(angle) * radius * 1.5 + bias;
          const dy = Math.sin(angle) * radius;
          // 좌우 스코어보드(무대 폭의 바깥쪽 22.4%) 뒤로 숨지 않도록 안쪽 구간으로 clamp.
          next[p.id] = [Math.min(0.76, Math.max(0.24, trexX + dx)), Math.min(0.86, Math.max(0.18, coreY + 0.05 + dy))];
        }
        return next;
      });
    };
    roll();
    const id = window.setInterval(roll, 1200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players.length]);

  return points;
}

export function BattleArena({
  battle,
  shotEvents,
}: {
  battle: BattleState;
  shotEvents: BattleShotEvent[];
}): JSX.Element {
  const dust = useDustParticles(22);
  const { trex, coreName } = battle;

  const allPlayers: AllPlayer[] = useMemo(
    () => [
      ...battle.teamA.players.map((p, i) => ({ id: p.id, team: "A" as const, index: i })),
      ...battle.teamB.players.map((p, i) => ({ id: p.id, team: "B" as const, index: i })),
    ],
    [battle.teamA.players, battle.teamB.players],
  );
  const aimPoints = useAimPoints(allPlayers, trex.x, trex.corePos[1]);

  return (
    <div className="battle-arena">
      <div className="battle-arena__sky" />
      <div className="battle-arena__silhouettes" />
      <div className="battle-arena__ground" />
      <div className="battle-arena__vignette" />

      {dust.map((d, i) => (
        <span
          key={i}
          className="battle-dust"
          style={{
            left: `${d.left}%`,
            width: d.size,
            height: d.size,
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}

      <div
        className="battle-trex"
        style={{
          left: pct(trex.x),
          top: pct(0.56),
          transform: `translate(-50%, -50%) scaleX(${trex.facing})`,
        }}
      >
        <span className="battle-trex__body" aria-hidden>
          🦖
        </span>
      </div>

      <div className="battle-core" style={{ left: pct(trex.corePos[0]), top: pct(trex.corePos[1]) }}>
        <span className="battle-core__glow" />
        <span className="battle-core__label">{coreName} 코어 · 약점</span>
      </div>

      {allPlayers.map((p) => {
        const point = aimPoints[p.id];
        if (!point) return null;
        return (
          <div
            key={p.id}
            className={`battle-crosshair battle-crosshair--${p.team.toLowerCase()}`}
            style={{ left: pct(point[0]), top: pct(point[1]) }}
          >
            <span className="battle-crosshair__ring" />
            <span className="battle-crosshair__label">P{p.index + 1}</span>
          </div>
        );
      })}

      {shotEvents.map((evt) => (
        <ShotEffect key={evt.id} event={evt} />
      ))}
    </div>
  );
}

function ShotEffect({ event }: { event: BattleShotEvent }): JSX.Element | null {
  if (!event.hit) return null;
  const [mx, my] = GUN_MUZZLE[event.team];
  const [tx, ty] = event.point;
  // 각도/길이는 실제 픽셀 공간(1920x1080)에서 계산해야 종횡비 왜곡이 없다.
  const dx = (tx - mx) * STAGE_W;
  const dy = (ty - my) * STAGE_H;
  const length = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  return (
    <>
      <div
        className={`battle-laser battle-laser--${event.team.toLowerCase()}`}
        style={{
          left: pct(mx),
          top: pct(my),
          width: `${length}px`,
          transform: `rotate(${angle}deg)`,
        }}
      />
      <div
        className={`battle-impact battle-impact--${event.team.toLowerCase()}${event.core ? " battle-impact--core" : ""}`}
        style={{ left: pct(tx), top: pct(ty) }}
      />
    </>
  );
}
