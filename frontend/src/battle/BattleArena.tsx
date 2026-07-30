/** 풀블리드 3D 무대 근사: 황혼 배경, 배회하는 스켈레톤 트리라노, 코어 마커, 크로스헤어, 레이저. */

import { useMemo, type CSSProperties } from "react";
import { CHARGING_DURATION_MS } from "@trex/shared";
import type { BattleShotEvent, BattleState, TeamId } from "./battleTypes";
import { GUN_MUZZLE, STAGE_H, STAGE_W } from "./battleLayout";
import { BattleTrexModel } from "./BattleTrexModel";

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

interface AllPlayer {
  id: string;
  name: string;
  team: TeamId;
  index: number;
  color: string;
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
  const { trex, coreName } = battle;
  const chaseDepth = Math.min(1, Math.max(0, (trex.y - 0.5) / 0.29));
  // 도로의 소실점(y=0.5)에서 카메라 쪽(y=0.79)으로 올수록 실제 원근 투영처럼
  // 후반부에 더 빠르게 커진다. 위치와 크기는 같은 trex.y에서 계산해야 서로 어긋나지 않는다.
  const chasePerspective = chaseDepth ** 1.35;
  const finalDepthScale = 1 + ((trex.y - 0.72) / 0.018) * 0.035;
  const stageScale =
    battle.chargingStage === 1
      ? 1
      : battle.chargingStage === 2
        ? 0.08 + chasePerspective * 0.48
        : 1.665 * finalDepthScale;
  const roundDurationSec = CHARGING_DURATION_MS / 1000;
  const sunsetProgress = Math.min(1, Math.max(0, 1 - battle.remainingSec / roundDurationSec));

  const allPlayers: AllPlayer[] = useMemo(
    () => [
      ...battle.teamA.players.map((p, i) => ({ id: p.id, name: p.name, team: "A" as const, index: i, color: p.color })),
      ...battle.teamB.players.map((p, i) => ({ id: p.id, name: p.name, team: "B" as const, index: i, color: p.color })),
    ],
    [battle.teamA.players, battle.teamB.players],
  );

  return (
    <div className={`battle-arena battle-arena--stage-${battle.chargingStage}`}>
      <div className="battle-arena__sky" />
      <div className="battle-arena__sunset" style={{ opacity: sunsetProgress }} />
      <div className="battle-arena__vignette" />

      <div
        className="battle-trex"
        style={{
          left: pct(trex.x),
          top: pct(trex.y),
          transform: `translate(-50%, -50%) scale(${stageScale})`,
        }}
      >
        <BattleTrexModel presentation={battle.chargingStage === 2 ? "flee" : battle.chargingStage === 3 ? "final" : "front"} />
      </div>

      <div
        className={`battle-core${battle.chargingStage === 2 ? " battle-core--hidden" : ""}`}
        style={{
          left: pct(trex.corePos[0]),
          top: pct(trex.corePos[1]),
        }}
      >
        <span className="battle-core__glow" />
        <span className="battle-core__label">{battle.chargingStage === 3 ? `최종 약점 · ${coreName}` : `${coreName} 코어 · 약점`}</span>
      </div>

      <div className="battle-stage-banner">
        <strong>PHASE {battle.chargingStage}</strong>
        <span>{battle.chargingStage === 1 ? "코어를 활성화하라" : battle.chargingStage === 2 ? "도망치는 티라노를 추격하라" : "최후의 돌진을 저지하라"}</span>
      </div>

      {battle.chargingStage === 3 && (
        <>
          <FinalTeamStatus team="A" lives={battle.teamAFinalLives} secondsLeft={battle.teamAFinalSecondsLeft} />
          <FinalTeamStatus team="B" lives={battle.teamBFinalLives} secondsLeft={battle.teamBFinalSecondsLeft} />
        </>
      )}

      {allPlayers.map((p) => {
        const point = aimPoints[p.id];
        if (!point) return null;
        return (
          <div
            key={p.id}
            className={`battle-crosshair battle-crosshair--${p.team.toLowerCase()}`}
            style={{ left: pct(point[0]), top: pct(point[1]), color: p.color }}
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

function FinalTeamStatus({ team, lives, secondsLeft }: { team: TeamId; lives: number; secondsLeft: number }): JSX.Element {
  return (
    <div className={`battle-final-status battle-final-status--${team.toLowerCase()}`}>
      <strong className="battle-final-status__team">{team}팀</strong>
      <div className="battle-final-status__lives" aria-label={`${team}팀 남은 목숨 ${lives}개`}>
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className={index < lives ? "is-alive" : "is-lost"}>♥</span>
        ))}
      </div>
      <div className={`battle-final-status__timer${secondsLeft <= 3 ? " is-danger" : ""}`}>
        <strong>{secondsLeft}</strong>
        <span>초 안에 급소 명중</span>
      </div>
    </div>
  );
}

function ShotEffect({ event }: { event: BattleShotEvent }): JSX.Element {
  const [mx, my] = GUN_MUZZLE[event.team];
  const [tx, ty] = event.point;
  // 각도/길이는 실제 픽셀 공간(1920x1080)에서 계산해야 종횡비 왜곡이 없다.
  const dx = (tx - mx) * STAGE_W;
  const dy = (ty - my) * STAGE_H;
  const length = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const effectStyle = {
    "--shot-color": event.playerColor,
    "--laser-angle": `${angle}deg`,
  } as CSSProperties;

  return (
    <>
      <div
        className={`battle-laser battle-laser--${event.team.toLowerCase()}`}
        style={{
          left: pct(mx),
          top: pct(my),
          width: `${length}px`,
          ...effectStyle,
        }}
      >
        <span className="battle-laser__head" />
      </div>
      <div
        className={`battle-impact${event.hit ? " battle-impact--hit" : " battle-impact--miss"}${event.core ? " battle-impact--core" : ""}`}
        style={{ left: pct(tx), top: pct(ty), ...effectStyle }}
      >
        <span className="battle-impact__flash" />
        <span className="battle-impact__ring battle-impact__ring--1" />
        <span className="battle-impact__ring battle-impact__ring--2" />
        <span className="battle-impact__ring battle-impact__ring--3" />
        <span className="battle-impact__dust battle-impact__dust--1" />
        <span className="battle-impact__dust battle-impact__dust--2" />
        <span className="battle-impact__dust battle-impact__dust--3" />
        <span className="battle-impact__dust battle-impact__dust--4" />
        <span className="battle-impact__dust battle-impact__dust--5" />
        <span className="battle-impact__dust battle-impact__dust--6" />
        <span className="battle-impact__spark battle-impact__spark--1" />
        <span className="battle-impact__spark battle-impact__spark--2" />
        <span className="battle-impact__spark battle-impact__spark--3" />
        <span className="battle-impact__spark battle-impact__spark--4" />
        {event.scoreDelta > 0 && <span className="battle-impact__score">{event.playerName} +{event.scoreDelta}</span>}
      </div>
    </>
  );
}
