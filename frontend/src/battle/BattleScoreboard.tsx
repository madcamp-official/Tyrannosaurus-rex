/** 사이드 스코어보드: 플레이어/발사/명중/에너지 기여. B팀은 컬럼 순서를 반전해 바깥→안쪽으로 읽히게 한다. */

import type { BattleTeam, TeamId } from "./battleTypes";
import { hitRate } from "./battleTypes";

const TEAM_META: Record<TeamId, { label: string; emblem: string; name: string }> = {
  A: { label: "A팀", emblem: "🔥", name: "A팀" },
  B: { label: "B팀", emblem: "❄", name: "B팀" },
};

export function BattleScoreboard({ team, teamId }: { team: BattleTeam; teamId: TeamId }): JSX.Element {
  const meta = TEAM_META[teamId];
  const mirrored = teamId === "B";
  const ranked = [...team.players].sort((a, b) => b.energy - a.energy);

  const columns = mirrored
    ? ["에너지 기여", "명중", "발사", "플레이어"]
    : ["플레이어", "발사", "명중", "에너지 기여"];

  return (
    <div className={`battle-board battle-board--${teamId.toLowerCase()}${mirrored ? " battle-board--mirrored" : ""}`}>
      <div className="battle-board__header">
        <span className="battle-board__emblem">{meta.emblem}</span>
        <span className="battle-board__name">{meta.name}</span>
        <span className="battle-board__sub">
          {team.players.length}명 · 명중률 {hitRate(team)}%
        </span>
      </div>

      <table className="battle-board__table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ranked.map((p, i) => {
            const cells = mirrored
              ? [Math.round(p.energy), p.hits, p.shots, p.name]
              : [p.name, p.shots, p.hits, Math.round(p.energy)];
            return (
              <tr key={p.id} className={i === 0 ? "battle-board__row--top" : undefined}>
                {cells.map((cell, ci) => (
                  <td key={ci} className={typeof cell === "string" && ci === (mirrored ? 3 : 0) ? "battle-board__name-cell" : undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="battle-board__footer">코어 명중 {team.coreHits}회</div>
    </div>
  );
}
