/** 기타/Excavation HUD.dc.html 목업 반영. 팀 기여도 사이드바 + 다음 뼈까지 진행도 + 효율 저하 배지. */

import type { PublicPlayer, TeamState } from "@trex/shared";

export function ExcavationTeamPanel({ team, players }: { team: TeamState; players: PublicPlayer[] }): JSX.Element {
  const totalInputs = players.reduce((sum, p) => sum + p.stats.excavationInputs, 0);
  const contributors = [...players]
    .sort((a, b) => b.stats.excavationInputs - a.stats.excavationInputs)
    .map((p) => ({
      id: p.id,
      name: p.nickname,
      color: p.color,
      pct: totalInputs > 0 ? Math.round((p.stats.excavationInputs / totalInputs) * 100) : 0,
    }));

  const progressPct = Math.min(100, Math.round((team.excavation.points / team.excavation.nextBoneAt) * 100));

  return (
    <div className="exca-view">
      <div className="exca-sidebar">
        <span className="exca-sidebar__title">기여도</span>
        {contributors.map((p) => (
          <div key={p.id}>
            <div className="exca-sidebar__row-head">
              <span className="exca-sidebar__dot" style={{ background: p.color }} />
              <span className="exca-sidebar__name">{p.name}</span>
            </div>
            <div className="exca-sidebar__bar">
              <div className="exca-sidebar__bar-fill" style={{ width: `${p.pct}%`, background: p.color }} />
            </div>
          </div>
        ))}
      </div>

      {team.excavation.efficiencyMultiplier < 1 && (
        <div className="exca-debuff">⛰️ 돌 발견! 효율 {Math.round(team.excavation.efficiencyMultiplier * 100)}%</div>
      )}

      <div className="exca-progress">
        <div className="exca-progress__label">
          다음 뼈까지 <strong>{progressPct}%</strong>
        </div>
        <div className="exca-progress__track">
          <div className="exca-progress__fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>
    </div>
  );
}
