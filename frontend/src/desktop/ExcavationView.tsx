/** 기타/Excavation HUD.dc.html 목업 반영. 팀 기여도 사이드바 + 다음 뼈까지 진행도. */

import { EXCAVATION_POINTS_PER_BONE, type PublicPlayer, type TeamState } from "@trex/shared";

export function ExcavationTeamPanel({ team, players }: { team: TeamState; players: PublicPlayer[] }): JSX.Element {
  const totalInputs = players.reduce((sum, p) => sum + p.stats.excavationInputs, 0);
  const contributors = [...players]
    .sort((a, b) => b.stats.excavationInputs - a.stats.excavationInputs)
    .map((p) => ({
      id: p.id,
      name: p.nickname,
      color: p.color,
      count: p.stats.excavationInputs,
      pct: totalInputs > 0 ? Math.round((p.stats.excavationInputs / totalInputs) * 100) : 0,
    }));

  // nextBoneAt은 발굴 시작부터 누적된 목표치라 points도 계속 누적된다 — 골드 뼈 이벤트로
  // nextBoneAt이 앞당겨질 수 있으므로, "이번 뼈 구간의 시작점"을 nextBoneAt에서 역산해
  // 뼈 하나당 항상 0%→100%로 보이게 만든다.
  const segmentStart = Math.max(0, team.excavation.nextBoneAt - EXCAVATION_POINTS_PER_BONE);
  const segmentSpan = Math.max(1, team.excavation.nextBoneAt - segmentStart);
  const progressPct = Math.min(100, Math.max(0, Math.round(((team.excavation.points - segmentStart) / segmentSpan) * 100)));

  if (team.excavation.result) {
    const isWin = team.excavation.result === "WIN";
    const isDraw = team.excavation.result === "DRAW";
    const variant = isWin ? "win" : isDraw ? "draw" : "lose";
    return (
      <div className={`exca-result exca-result--${variant}`}>
        <div className="exca-result__label">{isWin ? "WIN" : isDraw ? "DRAW" : "LOSE"}</div>
        <div className="exca-result__score">{Math.round(team.scores.excavation ?? 0)}점</div>
        {isWin && <p className="exca-result__hint">상대 팀을 기다리는 중…</p>}
      </div>
    );
  }

  return (
    <div className="exca-view">
      <div className="exca-sidebar">
        <span className="exca-sidebar__title">기여도</span>
        {contributors.map((p) => (
          <div key={p.id}>
            <div className="exca-sidebar__row-head">
              <span className="exca-sidebar__dot" style={{ background: p.color }} />
              <span className="exca-sidebar__name">{p.name}</span>
              <span className="exca-sidebar__count">{p.count}회</span>
            </div>
            <div className="exca-sidebar__bar">
              <div className="exca-sidebar__bar-fill" style={{ width: `${p.pct}%`, background: p.color }} />
            </div>
          </div>
        ))}
      </div>

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
