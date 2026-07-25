/** Plan.md §5.2, §17.2, §17.3. 모바일 입장과 준비 상태 (Day1 로비 범위). */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import type { Ack, PlayerId, RoomJoinResponse, RoomState, TeamId } from "@trex/shared";
import { connectSocket, type AppSocket } from "../socket";
import { newRequestId } from "../util/requestId";
import { ExcavationControls } from "./ExcavationControls";
import { PuzzleControls } from "./PuzzleControls";
import { AimControls } from "./AimControls";
import { DecorationVote } from "./DecorationVote";
import {
  applyPuzzleClaimChanged,
  applyPuzzlePieceMoved,
  applyPuzzlePiecePlaced,
  applyTeamPhaseChanged,
} from "../roomStateReducer";

type JoinStatus = "FORM" | "JOINING" | "JOINED" | "ERROR";

export function MobileJoin(): JSX.Element {
  const { code } = useParams<{ code: string }>();
  const socketRef = useRef<AppSocket | null>(null);
  const [nickname, setNickname] = useState("");
  const [status, setStatus] = useState<JoinStatus>("FORM");
  const [error, setError] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<PlayerId | null>(null);
  const [teamId, setTeamId] = useState<TeamId | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const handleJoin = (event: FormEvent) => {
    event.preventDefault();
    if (!code || nickname.trim().length === 0) return;
    setStatus("JOINING");
    setError(null);

    const socket = connectSocket("PLAYER");
    socketRef.current = socket;
    socket.on("room:state", (evt) => setRoomState(evt.data));
    socket.on("team:phaseChanged", (evt) => setRoomState((prev) => (prev ? applyTeamPhaseChanged(prev, evt.data) : prev)));
    socket.on("puzzle:claimChanged", (evt) => setRoomState((prev) => (prev ? applyPuzzleClaimChanged(prev, evt.data) : prev)));
    socket.on("puzzle:pieceMoved", (evt) => setRoomState((prev) => (prev ? applyPuzzlePieceMoved(prev, evt.data) : prev)));
    socket.on("puzzle:piecePlaced", (evt) => setRoomState((prev) => (prev ? applyPuzzlePiecePlaced(prev, evt.data) : prev)));

    socket.on("connect", () => {
      socket.emit(
        "room:join",
        { requestId: newRequestId(), roomCode: code, nickname: nickname.trim() },
        (ack: Ack<RoomJoinResponse>) => {
          if (!ack.ok) {
            setStatus("ERROR");
            setError(ack.error.message);
            return;
          }
          setPlayerId(ack.data.playerId);
          setTeamId(ack.data.teamId);
          setRoomState(ack.data.state);
          setStatus("JOINED");
        },
      );
    });
  };

  const toggleReady = () => {
    const next = !ready;
    setReady(next);
    socketRef.current?.emit("player:setReady", { requestId: newRequestId(), ready: next }, (ack) => {
      if (!ack.ok) setReady(!next);
    });
  };

  if (status !== "JOINED") {
    return (
      <main className="mobile-join">
        <h1>내 티라노사우루스 살려내!!!</h1>
        <form onSubmit={handleJoin}>
          <p>방 코드: {code}</p>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 8))}
            placeholder="닉네임 (1~8자)"
            maxLength={8}
            autoFocus
          />
          <button type="submit" disabled={status === "JOINING"}>
            입장하기
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </main>
    );
  }

  if (roomState && (roomState.roomPhase === "RESULT" || roomState.roomPhase === "DECORATION") && playerId) {
    const socket = socketRef.current;
    return (
      <main className="mobile-join">
        <h1>결과</h1>
        {roomState.winner.teamId && <p>{roomState.winner.teamId}팀 승리!</p>}
        {!roomState.winner.teamId && <p>무승부</p>}
        {socket && <DecorationVote socket={socket} />}
      </main>
    );
  }

  if (roomState && roomState.roomPhase !== "LOBBY" && teamId) {
    const team = roomState.teams[teamId];
    const socket = socketRef.current;
    return (
      <main className="mobile-join">
        {team.phase === "EXCAVATION" && socket && <ExcavationControls socket={socket} />}
        {team.phase === "ASSEMBLY" && socket && <PuzzleControls socket={socket} team={team} />}
        {(team.phase === "CHARGING" || team.phase === "PURIFICATION") && socket && <AimControls socket={socket} />}
        {team.phase === "REVIVED" && <p>{team.charging.form === "NORMAL" ? "🦖 부활 완료!" : "🧟 좀비가 되어버렸어요."} 데스크탑 화면을 확인하세요.</p>}
      </main>
    );
  }

  return (
    <main className="mobile-join">
      <p>{teamId}팀으로 입장했습니다.</p>
      <button type="button" onClick={toggleReady}>
        {ready ? "준비 완료 ✅ (취소)" : "준비하기"}
      </button>
      <p>다른 팀원 {roomState?.players.filter((p) => p.teamId === teamId && p.id !== playerId).length ?? 0}명</p>
    </main>
  );
}
