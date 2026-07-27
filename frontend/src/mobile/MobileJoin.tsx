/** Plan.md §5.2, §17.2, §17.3. 모바일 입장과 준비 상태 (Day1 로비 범위). */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import type { Ack, PlayerId, RoomJoinResponse, RoomState, TeamId } from "@trex/shared";
import { connectSocket, type AppSocket } from "../socket";
import { newRequestId } from "../util/requestId";
import { ExcavationControls } from "./ExcavationControls";
import { DinoRunControls } from "./DinoRunControls";
import { AimControls } from "./AimControls";
import {
  applyDinoFinished,
  applyDinoProgress,
  applyDinoStarted,
  applyTeamPhaseChanged,
} from "../roomStateReducer";

type JoinStatus = "FORM" | "JOINING" | "JOINED" | "ERROR";

function describeConnectError(message: string): string {
  if (message.includes("timeout")) return "서버 연결 시간 초과 — Wi-Fi가 같은지 확인해주세요.";
  if (message.includes("xhr poll error") || message.includes("websocket error")) {
    return "서버에 연결할 수 없어요 — PC와 같은 Wi-Fi에 연결돼 있는지 확인해주세요.";
  }
  if (message.includes("invalid handshake")) return "연결 정보가 올바르지 않아요. 새로고침 후 다시 시도해주세요.";
  if (message.includes("unsupported client version")) return "앱 버전이 서버와 맞지 않아요. 새로고침 후 다시 시도해주세요.";
  return `서버 연결 실패: ${message}`;
}

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
    socket.on("dino:started", (evt) => setRoomState((prev) => (prev ? applyDinoStarted(prev, evt.data) : prev)));
    socket.on("dino:progress", (evt) => setRoomState((prev) => (prev ? applyDinoProgress(prev, evt.data) : prev)));
    socket.on("dino:finished", (evt) => setRoomState((prev) => (prev ? applyDinoFinished(prev, evt.data) : prev)));

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
    socket.on("connect_error", (err) => {
      setStatus("ERROR");
      setError(describeConnectError(err.message));
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
    return (
      <main className="mobile-join">
        <h1>결과</h1>
        {roomState.winner.teamId && <p>{roomState.teamNames[roomState.winner.teamId]} 승리!</p>}
        {!roomState.winner.teamId && <p>무승부</p>}
        <p className="hint">데스크탑 화면에서 결과를 확인하세요.</p>
      </main>
    );
  }

  if (roomState && roomState.roomPhase !== "LOBBY" && teamId) {
    const team = roomState.teams[teamId];
    const socket = socketRef.current;
    return (
      <main className="mobile-join">
        {team.phase === "EXCAVATION" && socket && <ExcavationControls socket={socket} />}
        {team.phase === "ASSEMBLY" && socket && playerId && <DinoRunControls socket={socket} team={team} playerId={playerId} />}
        {team.phase === "CHARGING" && socket && <AimControls socket={socket} />}
        {team.phase === "REVIVED" && <p>{team.charging.form === "NORMAL" ? "🦖 부활 완료!" : "🦖 와이라노가 되어버렸어요."} 데스크탑 화면을 확인하세요.</p>}
      </main>
    );
  }

  return (
    <main className="mobile-join">
      <p>{teamId && roomState ? roomState.teamNames[teamId] : ""}으로 입장했습니다.</p>
      <button type="button" onClick={toggleReady}>
        {ready ? "준비 완료 ✅ (취소)" : "준비하기"}
      </button>
      <p>다른 팀원 {roomState?.players.filter((p) => p.teamId === teamId && p.id !== playerId).length ?? 0}명</p>
    </main>
  );
}
