/** Plan.md §5.1 결과 화면. 승자, 통계, 재경기 버튼. */

import {
  type Ack,
  type GameRematchResponse,
  type GameResultEvent,
  type RoomState,
  type TeamId,
} from "@trex/shared";
import type { AppSocket } from "../socket";
import { newRequestId } from "../util/requestId";

const TEAM_IDS: readonly TeamId[] = ["A", "B"];

function formatMs(ms: number | null): string {
  if (ms === null) return "-";
  return `${(ms / 1000).toFixed(1)}초`;
}

function formatScore(score: number | null | undefined): string {
  return score === null || score === undefined ? "-" : String(Math.round(score));
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
      <h2>
        {roomState.winner.teamId ? `${roomState.teamNames[roomState.winner.teamId]} 승리!` : "무승부"}
        {roomState.winner.reason && <span className="result-view__reason"> ({describeReason(roomState.winner.reason)})</span>}
      </h2>

      <div className="result-view__teams">
        {TEAM_IDS.map((teamId) => {
          const teamResult = gameResult?.teams.find((t) => t.teamId === teamId);
          return (
            <div key={teamId} className="result-view__team">
              <h3>{roomState.teamNames[teamId]}</h3>
              <p>{teamResult?.form === "YRANNO" ? "🦖 와이라노..." : "🦖 정상 부활"}</p>
              <ul>
                <li>발굴 {formatMs(teamResult?.excavationMs ?? null)}</li>
                <li>조립 {formatMs(teamResult?.assemblyMs ?? null)}</li>
                <li>충전 {formatMs(teamResult?.chargingMs ?? null)}</li>
              </ul>
              <ul className="result-view__scores">
                <li>경기 1(발굴) {formatScore(teamResult?.scores.excavation)}점</li>
                <li>경기 2(다이노런) {formatScore(teamResult?.scores.dinoRun)}점</li>
                <li>경기 3(사격) {formatScore(teamResult?.scores.charging)}점</li>
                <li className="result-view__total-score">총점 {formatScore(teamResult?.totalScore)}점</li>
              </ul>
              {roomState.roomPhase === "DECORATION" && (
                <div className="result-view__voting">
                  <p>박물관에 기록 중…</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {gameResult && gameResult.mvp.length > 0 && (
        <div className="result-view__mvp">
          <h3>개인 MVP</h3>
          <ol>
            {gameResult.mvp.map((entry) => (
              <li key={entry.playerId}>
                {entry.nickname} ({roomState.teamNames[entry.teamId]}) — {formatScore(entry.score)}점
              </li>
            ))}
          </ol>
        </div>
      )}

      <button type="button" onClick={handleRematch}>
        재경기
      </button>
    </section>
  );
}

function describeReason(reason: NonNullable<RoomState["winner"]["reason"]>): string {
  switch (reason) {
    case "SCORE_TOTAL":
      return "누적 점수";
    case "OPPONENT_DISCONNECTED":
      return "상대 팀 연결 끊김";
    case "TIME_LIMIT":
      return "시간 종료";
    case "DRAW":
      return "무승부";
    default:
      return reason;
  }
}
