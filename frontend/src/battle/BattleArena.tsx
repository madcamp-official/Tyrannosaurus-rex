/** 풀블리드 3D 무대 근사: 황혼 배경, 배회하는 스켈레톤 트리라노, 코어 마커, 크로스헤어, 레이저. */

import { useMemo } from "react";
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
  name: string;
  team: TeamId;
  index: number;
}


export function BattleArena({
  battle,
  shotEvents,
  aimPoints,
}: {
  battle: BattleState;
  shotEvents: BattleShotEvent[];
  /** 플레이어별 실제 조준 좌표(폰의 자이로/터치패드 입력 그대로). 아직 안 온 플레이어는 표시 안 함. */
  aimPoints: Record<string, [number, number]>;
}): JSX.Element {
  const dust = useDustParticles(22);
  const { trex, coreName } = battle;

  const allPlayers: AllPlayer[] = useMemo(
    () => [
      ...battle.teamA.players.map((p, i) => ({ id: p.id, name: p.name, team: "A" as const, index: i })),
      ...battle.teamB.players.map((p, i) => ({ id: p.id, name: p.name, team: "B" as const, index: i })),
    ],
    [battle.teamA.players, battle.teamB.players],
  );

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
          top: pct(trex.y),
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
            <span className="battle-crosshair__label">{p.name}</span>
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
