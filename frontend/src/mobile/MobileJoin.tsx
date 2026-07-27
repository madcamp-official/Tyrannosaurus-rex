/** Plan.md §5.2, §17.2, §17.3. 모바일 입장과 준비 상태 (Day1 로비 범위). */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import type { Ack, PlayerId, RoomJoinResponse, RoomState, TeamId } from "@trex/shared";
import { connectSocket, type AppSocket } from "../socket";
import { newRequestId } from "../util/requestId";
import { useWakeLock } from "../util/useWakeLock";
import { ExcavationControls } from "./ExcavationControls";
import { DinoRunControls } from "./DinoRunControls";
import { AimControls } from "./AimControls";
import {
  applyDinoFinished,
  applyDinoTeamResult,
  applyDinoProgress,
  applyDinoStarted,
  applyTeamPhaseChanged,
} from "../roomStateReducer";

type JoinStatus = "FORM" | "JOINING" | "JOINED" | "ERROR";
const TEAM_EMBLEM: Record<TeamId, string> = { A: "🔥", B: "❄️" };

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

  // 흔들어서 발굴하는 동안 화면이 꺼져 입력이 끊기지 않도록, 입장한 뒤부터 계속 켜둔다.
  useWakeLock(status === "JOINED");

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
    socket.on("dino:teamResult", (evt) => setRoomState((prev) => (prev ? applyDinoTeamResult(prev, evt.data) : prev)));

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
        <div className="mobile-join__bg" />
        <div className="mobile-join__scrim" />
        <div className="mobile-join__content">
          <img className="mobile-join__logo" src="/images/logo.png" alt="내 티라노를 살려내!" />
          <p className="mobile-join__subtitle">죽은 티라노, 정말 살려드립니다</p>
          <form className="mobile-join__card" onSubmit={handleJoin}>
            <p className="mobile-join__room-code">방 코드 {code}</p>
            <input
              className="mobile-join__input"
              value={nickname}
              onChange={(e) => setNickname(e.target.value.slice(0, 8))}
              placeholder="닉네임 (1~8자)"
              maxLength={8}
              autoFocus
            />
            <button type="submit" className="mobile-join__button" disabled={status === "JOINING"}>
              입장하기
            </button>
          </form>
          {error && (
            <div className="mobile-join__error">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}
        </div>
      </main>
    );
  }

  if (roomState && (roomState.roomPhase === "RESULT" || roomState.roomPhase === "DECORATION") && playerId) {
    return (
      <main className="mobile-join">
        <div className="mobile-join__bg" />
        <div className="mobile-join__scrim" />
        <div className="mobile-join__content">
          <img className="mobile-join__logo mobile-join__logo--small" src="/images/logo.png" alt="내 티라노를 살려내!" />
          <h1 className="mobile-join__result-title">결과</h1>
          {roomState.winner.teamId && <p className="mobile-join__result-winner">{roomState.teamNames[roomState.winner.teamId]} 승리!</p>}
          {!roomState.winner.teamId && <p className="mobile-join__result-winner">무승부</p>}
          <p className="mobile-game__hint">데스크탑 화면에서 결과를 확인하세요.</p>
        </div>
      </main>
    );
  }

  if (roomState && roomState.roomPhase !== "LOBBY" && teamId) {
    const team = roomState.teams[teamId];
    const socket = socketRef.current;
    return (
      <main className={`mobile-join mobile-join--team-${teamId.toLowerCase()}`}>
        <div className="mobile-join__bg" />
        <div className="mobile-join__scrim" />
        {team.phase === "EXCAVATION" && socket && <ExcavationControls socket={socket} result={team.excavation.result} />}
        {team.phase === "ASSEMBLY" && socket && playerId && (
          <DinoRunControls socket={socket} team={team} playerId={playerId} result={team.dinoRun.result} />
        )}
        {team.phase === "CHARGING" && socket && <AimControls socket={socket} />}
        {team.phase === "REVIVED" && (
          <div className="mobile-game__revived">
            <p className="mobile-game__title">
              {team.charging.form === "NORMAL" ? "🦖 부활 완료!" : "🦖 와이라노가 되어버렸어요."} 데스크탑 화면을 확인하세요.
            </p>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className={`mobile-join${teamId ? ` mobile-join--team-${teamId.toLowerCase()}` : ""}`}>
      <div className="mobile-join__bg" />
      <div className="mobile-join__scrim" />
      <div className="mobile-join__content">
        <img className="mobile-join__logo mobile-join__logo--small" src="/images/logo.png" alt="내 티라노를 살려내!" />
        <p className="mobile-join__team-label">
          {teamId ? TEAM_EMBLEM[teamId] : ""} {teamId && roomState ? roomState.teamNames[teamId] : ""}
        </p>
        <p className="mobile-join__team-sublabel">으로 입장했습니다</p>
        <button
          type="button"
          className={`mobile-join__ready-button${ready ? " mobile-join__ready-button--active" : ""}`}
          onClick={toggleReady}
        >
          {ready ? "준비 완료 ✅ (취소)" : "준비하기"}
        </button>
        <p className="mobile-join__teammate-count">
          다른 팀원 {roomState?.players.filter((p) => p.teamId === teamId && p.id !== playerId).length ?? 0}명
        </p>
      </div>
    </main>
  );
}
