/** Plan.md §5.1 결과 화면, §7 티꾸. 승자, 통계, 티꾸 진행 상황, 재경기 버튼. */

import { useEffect, useRef, useState } from "react";
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
import { saveMuseumEntry } from "../museum/museumStorage";

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
  const [finalDecorations, setFinalDecorations] = useState<Partial<Record<TeamId, Partial<Record<DecorationCategory, string>>>>>({});
  const [finalNames, setFinalNames] = useState<Partial<Record<TeamId, string | null>>>({});
  const savedTeamsRef = useRef(new Set<TeamId>());

  useEffect(() => {
    if (!socket) return undefined;

    const onVoteUpdated = (evt: { data: { teamId: TeamId; category: DecorationCategory; counts: Record<string, number> } }) => {
      setVoteCountsByTeam((prev) => ({
        ...prev,
        [evt.data.teamId]: { ...prev[evt.data.teamId], [evt.data.category]: evt.data.counts },
      }));
    };
    const onDecorationCompleted = (evt: { data: { teamId: TeamId; selections: Partial<Record<DecorationCategory, string>> } }) => {
      setFinalDecorations((prev) => ({ ...prev, [evt.data.teamId]: evt.data.selections }));
    };
    const onNameUpdated = (evt: { data: { teamId: TeamId; selectedName: string | null } }) => {
      if (evt.data.selectedName === null) return;
      setFinalNames((prev) => ({ ...prev, [evt.data.teamId]: evt.data.selectedName }));
    };

    socket.on("decoration:voteUpdated", onVoteUpdated);
    socket.on("decoration:completed", onDecorationCompleted);
    socket.on("name:voteUpdated", onNameUpdated);
    return () => {
      socket.off("decoration:voteUpdated", onVoteUpdated);
      socket.off("decoration:completed", onDecorationCompleted);
      socket.off("name:voteUpdated", onNameUpdated);
    };
  }, [socket]);

  useEffect(() => {
    if (!gameResult) return;
    for (const teamId of TEAM_IDS) {
      if (savedTeamsRef.current.has(teamId)) continue;
      const decorations = finalDecorations[teamId];
      const name = finalNames[teamId];
      if (!decorations || name === undefined || name === null) continue;

      const teamResult = gameResult.teams.find((t) => t.teamId === teamId);
      if (!teamResult) continue;
      const teamMembers = gameResult.players.filter((p) => p.teamId === teamId).map((p) => p.nickname);
      const shots = gameResult.players.filter((p) => p.teamId === teamId).reduce((sum, p) => sum + p.stats.shots, 0);
      const hits = gameResult.players.filter((p) => p.teamId === teamId).reduce((sum, p) => sum + p.stats.hits, 0);

      savedTeamsRef.current.add(teamId);
      saveMuseumEntry({
        id: `${gameResult.finishedAt}-${teamId}`,
        name,
        form: teamResult.form,
        teamId,
        teamMembers,
        createdAt: gameResult.finishedAt,
        dataVersion: 1,
        excavationMs: teamResult.excavationMs,
        assemblyMs: teamResult.assemblyMs,
        chargingMs: teamResult.chargingMs,
        accuracy: shots > 0 ? hits / shots : 0,
        decorations,
        fossils: roomState.teams[teamId].excavation.fossils,
      });
    }
  }, [gameResult, finalDecorations, finalNames, roomState]);

  const handleRematch = () => {
    socket?.emit("game:rematch", { requestId: newRequestId() }, (ack: Ack<GameRematchResponse>) => {
      void ack;
    });
  };

  return (
    <section className="result-view">
      <h2>
        {roomState.winner.teamId ? `${roomState.winner.teamId}팀 승리!` : "무승부"}
        {roomState.winner.reason && <span className="result-view__reason"> ({describeReason(roomState.winner.reason)})</span>}
      </h2>

      <div className="result-view__teams">
        {TEAM_IDS.map((teamId) => {
          const teamResult = gameResult?.teams.find((t) => t.teamId === teamId);
          return (
            <div key={teamId} className="result-view__team">
              <h3>
                {teamId}팀 {finalNames[teamId] ? `— ${finalNames[teamId]}` : ""}
              </h3>
              <p>{teamResult?.form === "YRANNO" ? "🦖 와이라노..." : "🦖 정상 부활"}</p>
              <ul>
                <li>발굴 {formatMs(teamResult?.excavationMs ?? null)}</li>
                <li>조립 {formatMs(teamResult?.assemblyMs ?? null)}</li>
                <li>충전 {formatMs(teamResult?.chargingMs ?? null)}</li>
              </ul>
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

      <button type="button" onClick={handleRematch}>
        재경기
      </button>
    </section>
  );
}

function describeReason(reason: NonNullable<RoomState["winner"]["reason"]>): string {
  switch (reason) {
    case "NORMAL_REVIVAL":
      return "정상 부활";
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
