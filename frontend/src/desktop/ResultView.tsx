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
import { BattleTrexModel } from "../battle/BattleTrexModel";

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
  const totals = teamPlayers.reduce(
    (acc, p) => ({
      digs: acc.digs + p.stats.excavationInputs,
      dodged: acc.dodged + p.stats.dinoCleared,
      shots: acc.shots + p.stats.shots,
      hits: acc.hits + p.stats.hits,
    }),
    { digs: 0, dodged: 0, shots: 0, hits: 0 },
  );
  // excavationInputs는 초당 입력 상한을 넘긴 분량을 절반 효율로 인정하는 레이트리밋 때문에
  // 소수로 누적될 수 있다 — 표시는 항상 정수(횟수)로 보이게 반올림한다.
  return { ...totals, digs: Math.round(totals.digs) };
}

function TeamResultTrex({ teamId, isWinner }: { teamId: TeamId; isWinner: boolean }): JSX.Element {
  return (
    <div
      className={`result-view__stage-slot result-view__stage-slot--${teamId.toLowerCase()} result-view__stage-slot--${isWinner ? "winner" : "yranno"}`}
    >
      <div className={`result-view__trex result-view__trex--${isWinner ? "winner" : "yranno"}`}>
        {isWinner ? (
          <BattleTrexModel mode="winner" />
        ) : (
          <img className="result-view__yranno-image" src="/images/yranno.webp" alt="와이라노" />
        )}
      </div>
      <strong className="result-view__stage-result">{isWinner ? "티라노사우루스!" : "와이라노..."}</strong>
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
  const score = formatScore(teamResult?.totalScore);
  const isWinner = roomState.winner.teamId === teamId;

  return (
    <div className={`result-view__team-panel result-view__team-panel--${teamId.toLowerCase()}`}>
      <div className="result-view__team-summary">
        <div className="result-view__team-identity">
          <h3 className="result-view__team-name">
            {TEAM_EMBLEM[teamId]} {roomState.teamNames[teamId]}
          </h3>
          <p className="result-view__form">{isWinner ? "🦖 티라노사우루스" : "🦖 와이라노..."}</p>
        </div>
        <div className="result-view__team-score">
          <strong>{score}</strong>
          <span>점</span>
        </div>
      </div>
      <ul className="result-view__stat-list">
        <li>
          <span>발굴 시 땅을 판 횟수</span>
          <strong>{summary.digs}회{topDigger && ` · MVP ${topDigger.nickname}`}</strong>
        </li>
        <li>
          <span>운석을 피한 수</span>
          <strong>{summary.dodged}/{dodgeMax}</strong>
        </li>
        <li>
          <span>에너지 사격 적중 수</span>
          <strong>{summary.hits}/{summary.shots}{topShooter && ` · MVP ${topShooter.nickname}`}</strong>
        </li>
        <li>
          <span>시간 보너스</span>
          <strong>{excavationSec} + {assemblySec} = {totalSec}초</strong>
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
        <TeamResultTrex teamId="A" isWinner={roomState.winner.teamId === "A"} />
        <div className="result-view__museum-slot">
          <span className="result-view__stage-slot-label">최종 승부</span>
        </div>
        <TeamResultTrex teamId="B" isWinner={roomState.winner.teamId === "B"} />
      </div>

      <div className="result-view__header-row">
        <TeamPanel teamId="A" roomState={roomState} gameResult={gameResult} />
        <TeamPanel teamId="B" roomState={roomState} gameResult={gameResult} />
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
