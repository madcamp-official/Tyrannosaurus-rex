/**
 * Plan.md §5.1. 데스크탑 운석 피하기 패널: 카운트다운과 팀원별 목숨·점수 현황.
 * 다이노런(장애물 점프) 대신 운석 피하기로 바뀌었지만 패널 이름은 그대로 유지.
 */

import { useEffect, useState } from "react";
import {
  DINO_RUN_DURATION_MS,
  METEOR_DODGE_LIVES,
  PHASE_START_GRACE_MS,
  type DinoRunGrade,
  type PublicPlayer,
  type RoomState,
  type TeamId,
  type TeamState,
} from "@trex/shared";

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

  const remainingSec = Math.max(
    0,
    Math.ceil(((team.phaseEndsAt ?? team.phaseStartedAt + PHASE_START_GRACE_MS + DINO_RUN_DURATION_MS) - Math.max(nowMs, team.phaseStartedAt + PHASE_START_GRACE_MS)) / 1000),
  );

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
      <p className="dino-view__phone-hint">📱 이제 폰을 봐주세요! 폰 화면에서 운석을 피해요.</p>
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

const TEAM_IDS: readonly TeamId[] = ["A", "B"];

function PlayerLives({
  player,
  team,
}: {
  player: PublicPlayer;
  team: TeamState;
}): JSX.Element {
  const lives = team.dinoRun.livesByPlayer[player.id] ?? METEOR_DODGE_LIVES;
  const score = team.dinoRun.scoreByPlayer[player.id] ?? 0;
  const dead = team.dinoRun.deadPlayerIds.includes(player.id);

  return (
    <li className={`dino-overlay__player${dead ? " dino-overlay__player--dead" : ""}`}>
      <span className="dino-overlay__player-dot" style={{ backgroundColor: player.color }} />
      <span className="dino-overlay__player-name">{player.nickname}</span>
      <span className="dino-overlay__player-score">{score}점</span>
      <span className="dino-overlay__lives" aria-label={`${lives}개의 생명`}>
        {dead ? "💀 탈락" : `${"♥".repeat(lives)}${"♡".repeat(Math.max(0, METEOR_DODGE_LIVES - lives))}`}
      </span>
    </li>
  );
}

/**
 * 운석 피하기는 휴대폰 중심 게임이므로 데스크탑의 기존 팀 패널 위에 단일 전면 연출을 띄운다.
 * 카운트다운은 모바일 SensorPermissionGate와 같은 phaseStartedAt/PHASE_START_GRACE_MS를 사용한다.
 */
export function DinoRunOverlay({ roomState }: { roomState: RoomState }): JSX.Element {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, []);

  const teamsInDinoRun = TEAM_IDS.filter((teamId) => roomState.teams[teamId].phase === "ASSEMBLY");
  const countdownSec = teamsInDinoRun.reduce((remaining, teamId) => {
    const teamRemaining = Math.max(
      0,
      Math.ceil((PHASE_START_GRACE_MS - (nowMs - roomState.teams[teamId].phaseStartedAt)) / 1000),
    );
    return Math.max(remaining, teamRemaining);
  }, 0);

  return (
    <div className="dino-overlay">
      <div className="dino-overlay__content">
        {countdownSec > 0 && (
          <div className="dino-overlay__countdown" aria-live="polite">
            <span>{countdownSec}</span>
            <small>초 후 시작</small>
          </div>
        )}

        <div className="dino-overlay__meteor" aria-hidden="true">
          <span className="dino-overlay__meteor-glow" />
          <span className="dino-overlay__meteor-icon">☄️</span>
          <span className="dino-overlay__meteor-shadow" />
        </div>

        <p className="dino-overlay__phone-hint">
          이제 폰을 봐주세요!
          <br />
          폰 화면에서 운석을 피해요!
        </p>

        <div className="dino-overlay__teams">
          {teamsInDinoRun.map((teamId) => {
            const team = roomState.teams[teamId];
            const players = roomState.players.filter((player) => player.teamId === teamId);
            return (
              <section key={teamId} className={`dino-overlay__team dino-overlay__team--${teamId.toLowerCase()}`}>
                <h2>{roomState.teamNames[teamId]}</h2>
                <ul>
                  {players.map((player) => (
                    <PlayerLives key={player.id} player={player} team={team} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
