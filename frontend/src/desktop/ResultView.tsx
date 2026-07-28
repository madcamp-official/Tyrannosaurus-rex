/** Plan.md §5.1 결과 화면. 승자, 통계, 재경기 버튼. */

import {
  SKY_OBJECT_COUNT,
  type Ack,
  type GameRematchResponse,
  type GameResultEvent,
  type PublicPlayer,
  type RoomState,
  type TeamId,
} from "@trex/shared";
import type { AppSocket } from "../socket";
import { newRequestId } from "../util/requestId";

const TEAM_EMBLEM: Record<TeamId, string> = { A: "🔥", B: "❄️" };

function formatScore(score: number | null | undefined): string {
  return score === null || score === undefined ? "-" : String(Math.round(score));
}

function formatSec(ms: number | null | undefined): string {
  return ((ms ?? 0) / 1000).toFixed(1);
}

/** 팀 내에서 statKey가 가장 높은 플레이어 — 카테고리별 팀 MVP 표시용. */
function topPlayerBy(players: PublicPlayer[], teamId: TeamId, statKey: "excavationInputs" | "hits"): PublicPlayer | null {
  const teamPlayers = players.filter((p) => p.teamId === teamId);
  if (teamPlayers.length === 0) return null;
  return teamPlayers.reduce((best, p) => (p.stats[statKey] > (best?.stats[statKey] ?? -1) ? p : best), teamPlayers[0]!);
}

/** 점수 산출 방식이 잘 안 와닿는다는 피드백에 따라, 추상적인 "점" 대신 실제로 한 일을 보여준다. */
function teamActionSummary(players: PublicPlayer[], teamId: TeamId) {
  const teamPlayers = players.filter((p) => p.teamId === teamId);
  return teamPlayers.reduce(
    (acc, p) => ({
      digs: acc.digs + p.stats.excavationInputs,
      dodged: acc.dodged + p.stats.dinoCleared,
      shots: acc.shots + p.stats.shots,
      hits: acc.hits + p.stats.hits,
    }),
    { digs: 0, dodged: 0, shots: 0, hits: 0 },
  );
}

function TeamStagePlaceholder({ teamId }: { teamId: TeamId }): JSX.Element {
  return (
    <div className={`result-view__stage-slot result-view__stage-slot--${teamId.toLowerCase()}`}>
      <span className="result-view__stage-slot-label">🦖 부활한 티라노 (준비 중)</span>
    </div>
  );
}

function TeamPanel({
  teamId,
  roomState,
  gameResult,
}: {
  teamId: TeamId;
  roomState: RoomState;
  gameResult: GameResultEvent | null;
}): JSX.Element {
  const teamResult = gameResult?.teams.find((t) => t.teamId === teamId);
  const players = gameResult?.players ?? [];
  const summary = teamActionSummary(players, teamId);
  const topDigger = topPlayerBy(players, teamId, "excavationInputs");
  const topShooter = topPlayerBy(players, teamId, "hits");
  const dodgeMax = SKY_OBJECT_COUNT * Math.max(1, players.filter((p) => p.teamId === teamId).length);
  const excavationSec = formatSec(teamResult?.excavationMs);
  const assemblySec = formatSec(teamResult?.assemblyMs);
  const totalSec = (Number(excavationSec) + Number(assemblySec)).toFixed(1);

  return (
    <div className={`result-view__team-panel result-view__team-panel--${teamId.toLowerCase()}`}>
      <h3 className="result-view__team-name">
        {TEAM_EMBLEM[teamId]} {roomState.teamNames[teamId]}
      </h3>
      <p className="result-view__form">{teamResult?.form === "YRANNO" ? "🦖 와이라노..." : "🦖 정상 부활"}</p>
      <ul className="result-view__stat-list">
        <li>
          발굴 시 땅을 판 횟수 : {summary.digs}회{topDigger && ` (MVP: ${topDigger.nickname})`}
        </li>
        <li>
          운석을 피한 수 : {summary.dodged}/{dodgeMax}
        </li>
        <li>
          티라노에게 적중한 에너지 사격 수 : {summary.hits}/{summary.shots}
          {topShooter && ` (MVP: ${topShooter.nickname})`}
        </li>
        <li>
          시간 보너스 : {excavationSec} + {assemblySec} = {totalSec}초!
        </li>
      </ul>
      {roomState.roomPhase === "DECORATION" && <p className="result-view__voting">박물관에 기록 중…</p>}
    </div>
  );
}

export function ResultView({
  roomState,
  gameResult,
  socket,
}: {
  roomState: RoomState;
  gameResult: GameResultEvent | null;
  socket: AppSocket | null;
}): JSX.Element {
  // 박물관 저장은 서버가 결과 확정 시점에 직접 DB에 기록한다
  // (backend/src/rooms/votingHandlers.ts) — 클라이언트는 결과만 보여주면 된다.
  const handleRematch = () => {
    socket?.emit("game:rematch", { requestId: newRequestId() }, (ack: Ack<GameRematchResponse>) => {
      void ack;
    });
  };

  return (
    <section className="result-view">
      <img className="result-view__top-logo" src="/images/logo.png" alt="내 티라노를 살려내!" />

      <h2 className="result-view__title">{roomState.winner.teamId ? `${roomState.teamNames[roomState.winner.teamId]} 승리!` : "무승부"}</h2>

      <div className="result-view__stage-row">
        <TeamStagePlaceholder teamId="A" />
        <div className="result-view__museum-slot">
          <span className="result-view__stage-slot-label">🏛 티꾸 완료 티라노 (준비 중)</span>
        </div>
        <TeamStagePlaceholder teamId="B" />
      </div>

      <div className="result-view__header-row">
        <TeamPanel teamId="A" roomState={roomState} gameResult={gameResult} />
        <TeamPanel teamId="B" roomState={roomState} gameResult={gameResult} />
      </div>

      <div className="result-view__score-header">
        <span className="result-view__score-header-value">{formatScore(gameResult?.teams.find((t) => t.teamId === "A")?.totalScore)}</span>
        <span className="result-view__score-header-team">{roomState.teamNames.A}</span>
        <span className="result-view__score-header-sep">|</span>
        <span className="result-view__score-header-team">{roomState.teamNames.B}</span>
        <span className="result-view__score-header-value">{formatScore(gameResult?.teams.find((t) => t.teamId === "B")?.totalScore)}</span>
      </div>

      {gameResult && gameResult.mvp.length > 0 && (
        <div className="result-view__mvp">
          <h3>개인 MVP</h3>
          <ol className="result-view__mvp-grid">
            {gameResult.mvp.map((entry, i) => (
              <li key={entry.playerId} className="result-view__mvp-row">
                <span className="result-view__mvp-rank">{i + 1}</span>
                <span className="result-view__mvp-name">
                  {entry.nickname} ({roomState.teamNames[entry.teamId]})
                </span>
                <span className="result-view__mvp-score">{Math.round(entry.score)}점</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <button type="button" className="lobby-start__button" onClick={handleRematch}>
        재경기
      </button>
    </section>
  );
}
