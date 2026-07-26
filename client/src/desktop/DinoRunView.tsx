/** Plan.md §5.1. 데스크탑 다이노런 패널: 카운트다운과 팀원별 클리어 현황. */

import { useEffect, useState } from "react";
import { DINO_RUN_DURATION_MS, type DinoRunGrade, type PublicPlayer, type TeamState } from "@trex/shared";

const GRADE_LABEL: Record<DinoRunGrade, string> = {
  PERFECT: "완벽한 조립!",
  GOOD: "양호한 조립",
  CLUMSY: "엉성한 조립…",
  MESSY: "누더기 조립?!",
};

export function DinoRunTeamPanel({ team, players }: { team: TeamState; players: PublicPlayer[] }): JSX.Element {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  const remainingSec = Math.max(0, Math.ceil((team.phaseStartedAt + DINO_RUN_DURATION_MS - nowMs) / 1000));
  const total = team.dinoRun.obstacleOffsetsMs.length;

  return (
    <div className="dino-view">
      <p className="dino-view__timer">🏃 다이노런 진행 중 — {remainingSec}초 남음</p>
      <ul className="excavation-view__players">
        {players.map((p) => {
          const cleared = team.dinoRun.clearedByPlayer[p.id]?.length ?? p.stats.dinoCleared;
          return (
            <li key={p.id} style={{ color: p.color }}>
              {p.nickname}: {cleared}/{total} 클리어
            </li>
          );
        })}
      </ul>
      {team.dinoRun.grade && <p className="dino-view__grade">{GRADE_LABEL[team.dinoRun.grade]}</p>}
    </div>
  );
}
