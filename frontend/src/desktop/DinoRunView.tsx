/**
 * Plan.md §5.1. 데스크탑 운석 피하기 패널: 카운트다운과 팀원별 목숨·점수 현황.
 * 다이노런(장애물 점프) 대신 운석 피하기로 바뀌었지만 패널 이름은 그대로 유지.
 */

import { useEffect, useState } from "react";
import { DINO_RUN_DURATION_MS, METEOR_DODGE_LIVES, type DinoRunGrade, type PublicPlayer, type TeamState } from "@trex/shared";

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

  if (team.dinoRun.result) {
    const isWin = team.dinoRun.result === "WIN";
    const isDraw = team.dinoRun.result === "DRAW";
    const variant = isWin ? "win" : isDraw ? "draw" : "lose";
    return (
      <div className={`exca-result exca-result--${variant}`}>
        <div className="exca-result__label">{isWin ? "WIN" : isDraw ? "DRAW" : "LOSE"}</div>
        <div className="exca-result__score">{Math.round(team.scores.dinoRun ?? 0)}점</div>
        {team.dinoRun.grade && <p className="exca-result__hint">{GRADE_LABEL[team.dinoRun.grade]}</p>}
        <p className="exca-result__hint">잠시 후 사격 화면으로 이동합니다…</p>
      </div>
    );
  }

  return (
    <div className="dino-view">
      <p className="dino-view__timer">☄️ 운석 피하기 진행 중 — {remainingSec}초 남음</p>
      <ul className="excavation-view__players">
        {players.map((p) => {
          const lives = team.dinoRun.livesByPlayer[p.id] ?? METEOR_DODGE_LIVES;
          const score = team.dinoRun.scoreByPlayer[p.id] ?? 0;
          const dead = team.dinoRun.deadPlayerIds.includes(p.id);
          return (
            <li key={p.id} style={{ color: p.color }}>
              {dead ? "💀 " : "❤️".repeat(lives) + "🖤".repeat(Math.max(0, METEOR_DODGE_LIVES - lives)) + " "}
              {p.nickname}: {score}점{dead ? " (탈락)" : ""}
            </li>
          );
        })}
      </ul>
      {team.dinoRun.grade && <p className="dino-view__grade">{GRADE_LABEL[team.dinoRun.grade]}</p>}
    </div>
  );
}
