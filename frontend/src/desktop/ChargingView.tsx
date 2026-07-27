/** Plan.md §5.1 에너지 사격 화면. 티라노 위치, 크로스헤어, 에너지/안정도, 와이라노 경고. */

import { ENERGY_TARGET, STABILITY_TARGET, type CoreZone, type NormalizedPoint, type PublicPlayer, type TeamState } from "@trex/shared";

export type TrexDisplay =
  | { position: NormalizedPoint; facing: "LEFT" | "RIGHT"; activeCore: CoreZone; corePosition: NormalizedPoint }
  | undefined;
export type CrosshairDisplay = { playerId: string; color: string; point: NormalizedPoint; receivedAt: number };

/**
 * Plan.md §2.3, §5.1: 스켈레톤은 모니터에 단 하나만 표시되고 두 팀이 같은 개체를 동시에
 * 조준·사격한다. 그래서 팀별 패널에는 에너지·안정도·팀원 통계만 두고, 공유 아레나(트렉스+양 팀
 * 크로스헤어)는 `PlayArea`가 화면 중앙에 한 번만 렌더링한다.
 */
export function ChargingTeamStats({ team, players }: { team: TeamState; players: PublicPlayer[] }): JSX.Element {
  return (
    <div className="charging-view">
      <div className="stat-bar">
        <span>부활 에너지 {Math.round(team.charging.energy)}</span>
        <div className="progress-bar">
          <div className="progress-bar__fill" style={{ width: `${(team.charging.energy / ENERGY_TARGET) * 100}%` }} />
        </div>
      </div>
      <div className="stat-bar">
        <span>생체 안정도 {Math.round(team.charging.stability)}</span>
        <div className="progress-bar progress-bar--stability">
          <div className="progress-bar__fill" style={{ width: `${(team.charging.stability / STABILITY_TARGET) * 100}%` }} />
        </div>
      </div>
      <p className="charging-view__core">활성 코어: {team.charging.activeCore}</p>

      <ul className="excavation-view__players">
        {players.map((p) => (
          <li key={p.id} style={{ color: p.color }}>
            {p.nickname}: {p.stats.hits}/{p.stats.shots}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 화면 중앙에 딱 하나만 뜨는 공유 스켈레톤 아레나. 양 팀 크로스헤어가 여기에 함께 표시된다. */
export function ChargingSharedArena({
  trex,
  crosshairs,
  hitFlash,
}: {
  trex: TrexDisplay;
  crosshairs: CrosshairDisplay[];
  hitFlash: "HIT" | "MISS" | null;
}): JSX.Element {
  return (
    <div className={`charging-view__arena${hitFlash === "HIT" ? " charging-view__arena--hit" : ""}`}>
      {trex && (
        <div
          className="charging-view__trex"
          style={{ left: `${trex.position.x * 100}%`, top: `${trex.position.y * 100}%`, transform: trex.facing === "LEFT" ? "scaleX(-1)" : undefined }}
        >
          🦖
        </div>
      )}
      {crosshairs.map((c) => (
        <div
          key={c.playerId}
          className="charging-view__crosshair"
          style={{ left: `${c.point.x * 100}%`, top: `${c.point.y * 100}%`, borderColor: c.color }}
        />
      ))}
    </div>
  );
}
