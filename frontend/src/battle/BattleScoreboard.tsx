/** 사이드 스코어보드: 플레이어/발사/명중/에너지 기여. B팀은 컬럼 순서를 반전해 바깥→안쪽으로 읽히게 한다. */

import type { BattleTeam, TeamId } from "./battleTypes";
import { hitRate } from "./battleTypes";

const TEAM_EMBLEM: Record<TeamId, string> = {
  A: "🔥",
  B: "❄",
};

export function BattleScoreboard({ team, teamId }: { team: BattleTeam; teamId: TeamId }): JSX.Element {
  const mirrored = teamId === "B";
  const ranked = [...team.players].sort((a, b) => b.energy - a.energy);

  const columns = mirrored
    ? ["에너지 기여", "명중", "발사", "플레이어"]
    : ["플레이어", "발사", "명중", "에너지 기여"];

  return (
    <div className={`battle-board battle-board--${teamId.toLowerCase()}${mirrored ? " battle-board--mirrored" : ""}`}>
      <div className="battle-board__header">
        <span className="battle-board__emblem">{TEAM_EMBLEM[teamId]}</span>
        <span className="battle-board__name">{team.name}</span>
        {team.result && (
          <span className={`battle-board__result battle-board__result--${team.result.toLowerCase()}`}>
            {team.result === "WIN" ? "🏆 부활 성공" : team.result === "DRAW" ? "무승부" : "부활 실패"}
          </span>
        )}
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
