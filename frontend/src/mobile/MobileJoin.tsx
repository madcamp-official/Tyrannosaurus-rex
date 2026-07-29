/** Plan.md §5.2, §17.2, §17.3. 모바일 입장과 준비 상태 (Day1 로비 범위). */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import {
  METEOR_FRUIT_SCORE_REWARD,
  METEOR_HEART_SCORE_REWARD,
  METEOR_HIT_SCORE_PENALTY,
  type Ack,
  type PlayerId,
  type RoomJoinResponse,
  type RoomState,
  type TeamId,
} from "@trex/shared";
import { connectSocket, type AppSocket } from "../socket";
import { newRequestId } from "../util/requestId";
import { useWakeLock } from "../util/useWakeLock";
import { describeAckError } from "../util/errorMessages";
import { requestAllSensorPermissions } from "../util/sensorPermissions";
import { ExcavationControls } from "./ExcavationControls";
import { DinoRunControls } from "./DinoRunControls";
import { AimControls } from "./AimControls";
import { SensorPermissionGate } from "./SensorPermissionGate";
import {
  applyDinoBonus,
  applyDinoFinished,
  applyDinoHit,
  applyDinoTeamResult,
  applyDinoStarted,
  applyPlayerDied,
  applyTeamPhaseChanged,
} from "../roomStateReducer";

type JoinStatus = "FORM" | "JOINING" | "JOINED" | "ERROR";
const TEAM_EMBLEM: Record<TeamId, string> = { A: "🔥", B: "❄️" };
const reconnectStorageKey = (roomCode: string) => `trex:player-session:${roomCode}`;
type StoredPlayerSession = { nickname: string; reconnectToken: string };

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
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const [ready, setReady] = useState(false);
  // 운석이 플레이어를 목표로 "잠기는" 좌표(objectId → x). 소켓 리스너는 join 완료(ack) 전에
  // 등록되므로 아래 playerId state를 클로저로 직접 참조하면 항상 null로 고정된다 — ref로
  // 최신 값을 따로 추적한다.
  const playerIdRef = useRef<PlayerId | null>(null);
  const [meteorLocks, setMeteorLocks] = useState<Map<number, number>>(new Map());
  // 운석 피하기 중 명중·과일·하트 등 순간적인 이벤트를 짧게 알려주는 배너.
  const [dinoToast, setDinoToast] = useState<string | null>(null);
  const dinoToastTimeoutRef = useRef<number | undefined>(undefined);
  const showDinoToast = (message: string) => {
    window.clearTimeout(dinoToastTimeoutRef.current);
    setDinoToast(message);
    dinoToastTimeoutRef.current = window.setTimeout(() => setDinoToast(null), 1800);
  };
  // 운석 피하기는 각자 자기 폰에서 따로 진행하는 개인 플레이라(§발굴 파기 소리와 달리 다 같이
  // 보는 화면이 아님), 명중·과일 효과음은 내 폰에서만, 내 이벤트일 때만 재생한다.
  const meteorHitAudioRef = useRef<HTMLAudioElement | null>(null);
  const fruitPickupAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    meteorHitAudioRef.current = new Audio("/audio/meteor-hit.mp3");
    meteorHitAudioRef.current.preload = "auto";
    fruitPickupAudioRef.current = new Audio("/audio/fruit-pickup.mp3");
    fruitPickupAudioRef.current.preload = "auto";
  }, []);
  const playMeteorHitSound = () => {
    const audio = meteorHitAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  };
  const playFruitPickupSound = () => {
    const audio = fruitPickupAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  };

  // 흔들어서 발굴하는 동안 화면이 꺼져 입력이 끊기지 않도록, 입장한 뒤부터 계속 켜둔다.
  useWakeLock(status === "JOINED");

  useEffect(() => {
    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const joinRoom = (joinNickname: string, reconnectToken?: string) => {
    if (!code || joinNickname.trim().length === 0) return;
    setStatus("JOINING");
    setError(null);

    socketRef.current?.close();
    const socket = connectSocket("PLAYER");
    socketRef.current = socket;
    socket.on("room:state", (evt) => {
      setServerTimeOffsetMs(evt.serverTime - Date.now());
      setRoomState(evt.data);
    });
    socket.on("team:phaseChanged", (evt) => {
      setServerTimeOffsetMs(evt.serverTime - Date.now());
      setRoomState((prev) => (prev ? applyTeamPhaseChanged(prev, evt.data) : prev));
    });
    socket.on("dino:started", (evt) => {
      setRoomState((prev) => (prev ? applyDinoStarted(prev, evt.data) : prev));
      // 새 라운드의 objectId는 이전 라운드와 번호가 겹치므로, 이전에 잠긴 좌표가 새 오브젝트에
      // 잘못 적용되지 않도록 비워둔다.
      setMeteorLocks(new Map());
    });
    socket.on("dino:hit", (evt) => {
      setRoomState((prev) => (prev ? applyDinoHit(prev, evt.data) : prev));
      if (evt.data.playerId === playerIdRef.current) {
        showDinoToast(`💥 운석에 맞았어요! (-${METEOR_HIT_SCORE_PENALTY}점)`);
        playMeteorHitSound();
      }
    });
    socket.on("dino:bonus", (evt) => {
      setRoomState((prev) => (prev ? applyDinoBonus(prev, evt.data) : prev));
      if (evt.data.playerId === playerIdRef.current) {
        showDinoToast(
          evt.data.kind === "HEART"
            ? `❤️ 생명을 얻었어요! (+${METEOR_HEART_SCORE_REWARD}점)`
            : `🍎 과일을 먹었어요! (+${METEOR_FRUIT_SCORE_REWARD}점)`,
        );
        if (evt.data.kind === "FRUIT") playFruitPickupSound();
      }
    });
    socket.on("dino:meteorLocked", (evt) => {
      if (evt.data.playerId !== playerIdRef.current) return;
      setMeteorLocks((prev) => {
        const next = new Map(prev);
        next.set(evt.data.objectId, evt.data.x);
        return next;
      });
    });
    socket.on("dino:playerDied", (evt) => setRoomState((prev) => (prev ? applyPlayerDied(prev, evt.data) : prev)));
    socket.on("dino:finished", (evt) => setRoomState((prev) => (prev ? applyDinoFinished(prev, evt.data) : prev)));
    socket.on("dino:teamResult", (evt) => setRoomState((prev) => (prev ? applyDinoTeamResult(prev, evt.data) : prev)));

    socket.on("connect", () => {
      socket.emit(
        "room:join",
        {
          requestId: newRequestId(),
          roomCode: code,
          nickname: joinNickname.trim(),
          ...(reconnectToken ? { reconnectToken } : {}),
        },
        (ack: Ack<RoomJoinResponse>) => {
          if (!ack.ok) {
            if (reconnectToken) localStorage.removeItem(reconnectStorageKey(code));
            setStatus("ERROR");
            setError(describeAckError(ack.error.code));
            return;
          }
          localStorage.setItem(
            reconnectStorageKey(code),
            JSON.stringify({ nickname: joinNickname.trim(), reconnectToken: ack.data.reconnectToken }),
          );
          setNickname(joinNickname.trim());
          setPlayerId(ack.data.playerId);
          playerIdRef.current = ack.data.playerId;
          setTeamId(ack.data.teamId);
          setRoomState(ack.data.state);
          setReady(ack.data.state.players.find((player) => player.id === ack.data.playerId)?.ready ?? false);
          setStatus("JOINED");
        },
      );
    });
    socket.on("connect_error", (err) => {
      setStatus("ERROR");
      setError(describeConnectError(err.message));
    });
  };

  useEffect(() => {
    if (!code) return;
    const rawSession = localStorage.getItem(reconnectStorageKey(code));
    if (!rawSession) return;
    try {
      const saved = JSON.parse(rawSession) as StoredPlayerSession;
      if (!saved.nickname || !saved.reconnectToken) throw new Error("invalid session");
      setNickname(saved.nickname);
      joinRoom(saved.nickname, saved.reconnectToken);
    } catch {
      localStorage.removeItem(reconnectStorageKey(code));
    }
    // 방 코드가 바뀌었을 때만 저장된 참가자 세션 복구를 시도한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const handleJoin = (event: FormEvent) => {
    event.preventDefault();
    if (!code || nickname.trim().length === 0) return;
    // 신규 입장은 사용자 제스처 안에서 센서 권한도 함께 요청한다.
    requestAllSensorPermissions();
    joinRoom(nickname);
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
    const content = (
      <>
        {team.phase === "EXCAVATION" && socket && <ExcavationControls socket={socket} teamId={teamId} result={team.excavation.result} />}
        {team.phase === "ASSEMBLY" && socket && playerId && (
          <DinoRunControls
            socket={socket}
            team={team}
            playerId={playerId}
            result={team.dinoRun.result}
            serverTimeOffsetMs={serverTimeOffsetMs}
            meteorLocks={meteorLocks}
            toast={dinoToast}
          />
        )}
        {(team.phase === "CHARGING_PRACTICE" || team.phase === "CHARGING") && socket && (
          // 두 phase를 하나의 JSX 자리에서 렌더링해야 CHARGING_PRACTICE에서 잡은 영점
          // (calibrated 등 내부 state)이 실제 CHARGING으로 넘어갈 때 유지된다 — 조건별로
          // 서로 다른 자리에 <AimControls>를 두면 phase가 바뀌는 순간 컴포넌트가
          // 통째로 마운트 해제·재마운트되어 영점이 초기화되는 버그가 있었다.
          <AimControls socket={socket} practice={team.phase === "CHARGING_PRACTICE"} />
        )}
        {team.phase === "REVIVED" && (
          // 부활 완료 여부·WIN/LOSE/DRAW 결과는 데스크탑 공유 화면(PlayArea)에만 띄운다 —
          // 다 같이 보는 결과라 폰마다 따로 뜨면 오히려 산만하다.
          <div className="mobile-game__revived">
            <p className="mobile-game__title">🦖 데스크탑 화면을 확인하세요!</p>
          </div>
        )}
      </>
    );
    return (
      <main className={`mobile-join mobile-join--team-${teamId.toLowerCase()}`}>
        <div className="mobile-join__bg" />
        <div className="mobile-join__scrim" />
        <SensorPermissionGate phaseStartedAt={team.phaseStartedAt}>{content}</SensorPermissionGate>
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
