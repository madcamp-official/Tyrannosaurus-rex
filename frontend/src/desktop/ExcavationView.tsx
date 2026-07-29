/** 기타/Excavation HUD.dc.html 목업 반영. 팀 기여도 사이드바 + 다음 뼈까지 진행도. */

import { EXCAVATION_POINTS_PER_BONE, type PublicPlayer, type TeamState } from "@trex/shared";

export function ExcavationTeamPanel({
  team,
  teamName,
  players,
}: {
  team: TeamState;
  teamName: string;
  players: PublicPlayer[];
}): JSX.Element {
  // excavationInputs는 초당 입력 상한을 넘긴 분량을 절반 효율로 인정하는 레이트리밋 때문에
  // 소수로 누적될 수 있다 — 비율(pct) 계산은 원래 값으로 하고, 화면에 보이는 "횟수"만 반올림한다.
  const totalInputs = players.reduce((sum, p) => sum + p.stats.excavationInputs, 0);
  const contributors = [...players]
    .sort((a, b) => b.stats.excavationInputs - a.stats.excavationInputs)
    .map((p) => ({
      id: p.id,
      name: p.nickname,
      color: p.color,
      count: Math.round(p.stats.excavationInputs),
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
      <div className="exca-progress" aria-label={`다음 뼈 발굴 진행률 ${progressPct}%`}>
        <div className="exca-progress__label">
          <strong>{progressPct}%</strong>
        </div>
        <div className="exca-progress__track">
          <div className="exca-progress__fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className={`exca-sidebar${team.id === "B" ? " exca-sidebar--mirrored" : ""}`}>
        <div className="exca-sidebar__header">
          <strong>{team.id === "A" ? "🔥" : "❄️"} {teamName}</strong>
          <span>{players.length}명 · 총 {Math.round(totalInputs)}회</span>
        </div>
        <table className="exca-sidebar__table">
          <thead>
            <tr>
              {(team.id === "A" ? ["플레이어", "흔들기", "기여도"] : ["기여도", "흔들기", "플레이어"]).map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contributors.map((player, index) => {
              const cells = team.id === "A"
                ? [player.name, `${player.count}회`, `${player.pct}%`]
                : [`${player.pct}%`, `${player.count}회`, player.name];
              return (
                <tr key={player.id} className={index === 0 ? "exca-sidebar__row--top" : undefined}>
                  {cells.map((cell, cellIndex) => (
                    <td key={cellIndex} className={cell === player.name ? "exca-sidebar__player" : undefined}>
                      {cell === player.name && <span className="exca-sidebar__dot" style={{ background: player.color }} />}
                      {cell}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="exca-sidebar__footer">발굴한 뼈 {team.excavation.discoveredBoneIds.length}개</div>
      </div>

    </div>
  );
}
