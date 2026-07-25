/** Plan.md §5.1 에너지 사격 화면. 티라노 위치, 크로스헤어, 에너지/안정도, 좀비 경고. */

import { ENERGY_TARGET, STABILITY_TARGET, type NormalizedPoint, type PublicPlayer, type TeamState } from "@trex/shared";

export type TrexDisplay = { position: NormalizedPoint; facing: "LEFT" | "RIGHT" } | undefined;
export type CrosshairDisplay = { playerId: string; color: string; point: NormalizedPoint; receivedAt: number };

export function ChargingTeamPanel({
  team,
  players,
  trex,
  crosshairs,
  hitFlash,
}: {
  team: TeamState;
  players: PublicPlayer[];
  trex: TrexDisplay;
  crosshairs: CrosshairDisplay[];
  hitFlash: "HIT" | "MISS" | null;
}): JSX.Element {
  return (
    <div className="charging-view">
      {team.phase === "PURIFICATION" && <p className="charging-view__warning">⚠️ 좀비 위험! 정화 사격 중…</p>}

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
