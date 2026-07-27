/** Plan.md §5.1 결과 화면, §7 티꾸. 승자, 통계, 티꾸 진행 상황, 재경기 버튼. */

import { useEffect, useState } from "react";
import {
  DECORATION_CATALOG,
  type Ack,
  type DecorationCategory,
  type GameRematchResponse,
  type GameResultEvent,
  type RoomState,
  type TeamId,
} from "@trex/shared";
import type { AppSocket } from "../socket";
import { newRequestId } from "../util/requestId";

const TEAM_IDS: readonly TeamId[] = ["A", "B"];
const CATEGORIES = Object.keys(DECORATION_CATALOG) as DecorationCategory[];

function formatMs(ms: number | null): string {
  if (ms === null) return "-";
  return `${(ms / 1000).toFixed(1)}초`;
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
  const [voteCountsByTeam, setVoteCountsByTeam] = useState<Partial<Record<TeamId, Partial<Record<DecorationCategory, Record<string, number>>>>>>({});
  const [finalNames, setFinalNames] = useState<Partial<Record<TeamId, string | null>>>({});

  // 박물관 저장은 이제 서버가 티꾸/이름 투표 확정 시점에 직접 DB에 기록한다
  // (backend/src/rooms/votingHandlers.ts) — 클라이언트는 결과만 보여주면 된다.
  useEffect(() => {
    if (!socket) return undefined;

    const onVoteUpdated = (evt: { data: { teamId: TeamId; category: DecorationCategory; counts: Record<string, number> } }) => {
      setVoteCountsByTeam((prev) => ({
        ...prev,
        [evt.data.teamId]: { ...prev[evt.data.teamId], [evt.data.category]: evt.data.counts },
      }));
    };
    const onNameUpdated = (evt: { data: { teamId: TeamId; selectedName: string | null } }) => {
      if (evt.data.selectedName === null) return;
      setFinalNames((prev) => ({ ...prev, [evt.data.teamId]: evt.data.selectedName }));
    };

    socket.on("decoration:voteUpdated", onVoteUpdated);
    socket.on("name:voteUpdated", onNameUpdated);
    return () => {
      socket.off("decoration:voteUpdated", onVoteUpdated);
      socket.off("name:voteUpdated", onNameUpdated);
    };
  }, [socket]);

  const handleRematch = () => {
    socket?.emit("game:rematch", { requestId: newRequestId() }, (ack: Ack<GameRematchResponse>) => {
      void ack;
    });
  };

  return (
    <section className="result-view">
      <header className="lobby-header lobby-header--centered">
        <img className="lobby-header__logo lobby-header__logo--big" src="/images/logo.png" alt="내 티라노를 살려내!" />
      </header>

      <h2>
        {roomState.winner.teamId ? `${roomState.teamNames[roomState.winner.teamId]} 승리!` : "무승부"}
        {roomState.winner.reason && <span className="result-view__reason"> ({describeReason(roomState.winner.reason)})</span>}
      </h2>

      <div className="result-view__teams">
        {TEAM_IDS.map((teamId) => {
          const teamResult = gameResult?.teams.find((t) => t.teamId === teamId);
          return (
            <div key={teamId} className="result-view__team">
              <h3>
                {roomState.teamNames[teamId]} {finalNames[teamId] ? `— ${finalNames[teamId]}` : ""}
              </h3>
              <p>{teamResult?.form === "YRANNO" ? "🦖 와이라노..." : "🦖 정상 부활"}</p>
              <ul className="result-view__stats">
                <li>
                  <span className="result-view__stat-label">발굴</span>
                  <span className="result-view__stat-time">{formatMs(teamResult?.excavationMs ?? null)}</span>
                  <span className="result-view__stat-sep">|</span>
                  <span className="result-view__stat-score">{teamResult?.scores.excavation ?? "-"}점</span>
                </li>
                <li>
                  <span className="result-view__stat-label">조립</span>
                  <span className="result-view__stat-time">{formatMs(teamResult?.assemblyMs ?? null)}</span>
                  <span className="result-view__stat-sep">|</span>
                  <span className="result-view__stat-score">{teamResult?.scores.dinoRun ?? "-"}점</span>
                </li>
                <li>
                  <span className="result-view__stat-label">충전</span>
                  <span className="result-view__stat-time">{formatMs(teamResult?.chargingMs ?? null)}</span>
                  <span className="result-view__stat-sep">|</span>
                  <span className="result-view__stat-score">{teamResult?.scores.charging ?? "-"}점</span>
                </li>
              </ul>
              <div className="result-view__total-score">{teamResult?.totalScore ?? "-"}</div>
              {roomState.roomPhase === "DECORATION" && (
                <div className="result-view__voting">
                  <p>티꾸 투표 중…</p>
                  {CATEGORIES.map((category) => (
                    <div key={category} className="result-view__category">
                      <span>{category}</span>
                      <span className="result-view__counts">
                        {DECORATION_CATALOG[category]
                          .map((item) => `${item.label}:${voteCountsByTeam[teamId]?.[category]?.[item.id] ?? 0}`)
                          .join(" ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {gameResult && gameResult.mvp.length > 0 && (
        <div className="result-view__mvp">
          <h3>개인 MVP</h3>
          <ol className="result-view__mvp-list">
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
