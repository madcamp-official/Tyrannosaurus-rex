/** Plan.md §5.1, §17.1, §17.4. 데스크탑 로비: 방 생성, QR, 팀 배정, 게임 시작. */

import { useEffect, useRef, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import {
  BONE_IDS,
  DEFAULT_MAX_PLAYERS_PER_TEAM,
  MAX_PLAYERS_PER_TEAM_CAP,
  PUZZLE_TARGET_TRANSFORMS,
  ROOM_NAME_MAX_LENGTH,
  TEAM_DISPLAY_NAMES,
  type Ack,
  type GameResultEvent,
  type PlayerId,
  type RoomCreateResponse,
  type RoomState,
  type TeamId,
} from "@trex/shared";
import { connectSocket, type AppSocket } from "../socket";
import { GodotStage, useGodotBridge } from "../godot/GodotStage";
import { DebugPanel } from "../DebugPanel";
import { newRequestId } from "../util/requestId";
import { PlayArea, type ChargingEphemeral } from "./PlayArea";
import { ResultView } from "./ResultView";
import {
  applyBoneFound,
  applyCoreChanged,
  applyExcavationEvent,
  applyExcavationProgress,
  applyGameResult,
  applyDinoFinished,
  applyDinoProgress,
  applyDinoStarted,
  applyRevivalFormChanged,
  applyShotResolved,
  applyTeamPhaseChanged,
} from "../roomStateReducer";

const CROSSHAIR_STALE_MS = 700;
const TEAM_EMBLEM: Record<TeamId, string> = { A: "🔥", B: "❄️" };

export function DesktopLobby(): JSX.Element {
  const socketRef = useRef<AppSocket | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [homeStarted, setHomeStarted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [ephemeral, setEphemeral] = useState<ChargingEphemeral>({
    trexByTeam: {},
    crosshairsByPlayer: {},
    hitFlashByTeam: {},
    coreChangesAtByTeam: {},
    battleShotEvents: [],
  });
  const [gameResult, setGameResult] = useState<GameResultEvent | null>(null);
  const { bridge } = useGodotBridge();

  useEffect(() => {
    const socket = connectSocket("HOST");
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));

    socket.on("room:state", (evt) => {
      setRoomState(evt.data);
      if (evt.data.roomPhase === "LOBBY") setGameResult(null);
    });
    socket.on("excavation:progress", (evt) => setRoomState((prev) => (prev ? applyExcavationProgress(prev, evt.data) : prev)));
    socket.on("excavation:boneFound", (evt) => {
      setRoomState((prev) => (prev ? applyBoneFound(prev, evt.data) : prev));
      bridge.send("BONE_DISCOVERED", { teamId: evt.data.teamId, boneId: evt.data.boneId, position: { x: 0.5, y: 0.5 } });
    });
    socket.on("excavation:eventTriggered", (evt) => setRoomState((prev) => (prev ? applyExcavationEvent(prev, evt.data) : prev)));
    socket.on("team:phaseChanged", (evt) => setRoomState((prev) => (prev ? applyTeamPhaseChanged(prev, evt.data) : prev)));
    socket.on("dino:started", (evt) => setRoomState((prev) => (prev ? applyDinoStarted(prev, evt.data) : prev)));
    socket.on("dino:progress", (evt) => setRoomState((prev) => (prev ? applyDinoProgress(prev, evt.data) : prev)));
    socket.on("dino:finished", (evt) => {
      setRoomState((prev) => (prev ? applyDinoFinished(prev, evt.data) : prev));
      // 조립 평가 완료 — Godot에 13개 조각 전부 완성 스냅을 지시한다 (§12.3).
      bridge.send("PUZZLE_STATE", {
        teamId: evt.data.teamId,
        pieces: BONE_IDS.map((boneId) => ({ boneId, transform: PUZZLE_TARGET_TRANSFORMS[boneId], fixed: true })),
      });
    });
    socket.on("energy:coreChanged", (evt) => {
      setRoomState((prev) => (prev ? applyCoreChanged(prev, evt.data) : prev));
      setEphemeral((prev) => ({
        ...prev,
        coreChangesAtByTeam: { ...prev.coreChangesAtByTeam, [evt.data.teamId]: evt.data.nextChangeAt },
      }));
    });
    socket.on("revival:formChanged", (evt) => {
      setRoomState((prev) => (prev ? applyRevivalFormChanged(prev, evt.data) : prev));
      bridge.send("REVIVAL_RESULT", { teamId: evt.data.teamId, form: evt.data.form, purified: evt.data.form === "NORMAL" });
    });
    socket.on("game:result", (evt) => {
      setRoomState((prev) => (prev ? applyGameResult(prev, evt.data) : prev));
      setGameResult(evt.data);
    });

    socket.on("trex:transform", (evt) => {
      setEphemeral((prev) => ({
        ...prev,
        trexByTeam: {
          ...prev.trexByTeam,
          [evt.data.teamId]: {
            position: evt.data.position,
            facing: evt.data.facing,
            activeCore: evt.data.activeCore,
            corePosition: evt.data.corePosition,
          },
        },
      }));
      bridge.send("TREX_TRANSFORM", {
        teamId: evt.data.teamId,
        position: evt.data.position,
        rotationDeg: evt.data.rotationDeg,
        facing: evt.data.facing,
        poseId: evt.data.poseId,
      });
    });
    socket.on("aim:playerMoved", (evt) => {
      setRoomState((prev) => {
        if (!prev) return prev;
        const player = prev.players.find((p) => p.id === evt.data.playerId);
        if (!player) return prev;
        setEphemeral((ePrev) => {
          const nextCrosshairsByPlayer = {
            ...ePrev.crosshairsByPlayer,
            [evt.data.playerId]: {
              playerId: evt.data.playerId,
              teamId: evt.data.teamId,
              point: evt.data.point,
              color: player.color,
              receivedAt: Date.now(),
            },
          };
          const teamCrosshairs = Object.values(nextCrosshairsByPlayer)
            .filter((c) => c.teamId === evt.data.teamId)
            .map((c) => ({ playerId: c.playerId, color: c.color, point: c.point, active: true }));
          bridge.send("CROSSHAIRS", { teamId: evt.data.teamId, crosshairs: teamCrosshairs });
          return { ...ePrev, crosshairsByPlayer: nextCrosshairsByPlayer };
        });
        return prev;
      });
    });
    socket.on("energy:shotResolved", (evt) => {
      setRoomState((prev) => (prev ? applyShotResolved(prev, evt.data) : prev));
      setEphemeral((prev) => ({ ...prev, hitFlashByTeam: { ...prev.hitFlashByTeam, [evt.data.teamId]: evt.data.hit ? "HIT" : "MISS" } }));
      window.setTimeout(() => {
        setEphemeral((prev) => ({ ...prev, hitFlashByTeam: { ...prev.hitFlashByTeam, [evt.data.teamId]: undefined } }));
      }, 250);

      // 배틀 화면의 발사 임팩트 연출용 — 900ms 뒤 스스로 사라지는 일회성 이벤트로만 취급한다.
      const isCoreHit = evt.data.hitZone === "HEART" || evt.data.hitZone === "SKULL" || evt.data.hitZone === "SPINE";
      const shotEventId = `${evt.data.playerId}-${evt.data.shotId}`;
      const impactPoint = evt.data.hitPoint ?? evt.data.aimPoint;
      setEphemeral((prev) => ({
        ...prev,
        battleShotEvents: [
          ...prev.battleShotEvents,
          {
            id: shotEventId,
            team: evt.data.teamId,
            playerId: evt.data.playerId,
            hit: evt.data.hit,
            core: isCoreHit,
            point: [impactPoint.x, impactPoint.y],
            ts: Date.now(),
          },
        ],
      }));
      window.setTimeout(() => {
        setEphemeral((prev) => ({ ...prev, battleShotEvents: prev.battleShotEvents.filter((e) => e.id !== shotEventId) }));
      }, 900);

      bridge.send("ENERGY_HIT", {
        teamId: evt.data.teamId,
        hitZone: evt.data.hitZone,
        hitPoint: evt.data.hitPoint,
        energy: evt.data.energyAfter,
        stability: evt.data.stabilityAfter,
      });
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const cutoff = Date.now() - CROSSHAIR_STALE_MS;
      setEphemeral((prev) => {
        const next: Record<PlayerId, ChargingEphemeral["crosshairsByPlayer"][string]> = {};
        let changed = false;
        for (const [playerId, crosshair] of Object.entries(prev.crosshairsByPlayer)) {
          if (crosshair.receivedAt < cutoff) {
            changed = true;
            continue;
          }
          next[playerId] = crosshair;
        }
        return changed ? { ...prev, crosshairsByPlayer: next } : prev;
      });
    }, 500);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!joinUrl) return;
    QRCode.toDataURL(joinUrl, { margin: 1, width: 240 }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [joinUrl]);

  const handleCreateRoom = (roomName: string, maxPlayersPerTeam: number) => {
    setStartError(null);
    setCreating(true);
    socketRef.current?.emit(
      "room:create",
      { requestId: newRequestId(), roomName, settings: { maxPlayersPerTeam, roundDurationSec: 300, language: "ko" } },
      (ack: Ack<RoomCreateResponse>) => {
        setCreating(false);
        if (!ack.ok) {
          setStartError(ack.error.message);
          return;
        }
        setJoinUrl(ack.data.joinUrl);
        setRoomState(ack.data.state);
      },
    );
  };

  useEffect(() => {
    if (!roomState) return;
    bridge.sendFullSnapshot({
      revision: roomState.revision,
      teams: {
        A: snapshotForTeam(roomState.teams.A),
        B: snapshotForTeam(roomState.teams.B),
      },
    });
  }, [roomState, bridge]);

  const handleEnterFromHome = () => {
    setHomeStarted(true);
  };

  const showHeader = !roomState || roomState.roomPhase === "LOBBY";

  if (!homeStarted) {
    return (
      <main className="desktop-lobby">
        <div className="home-screen">
          <div className="home-screen__scrim" />
          <img className="home-screen__logo-mark" src="/images/logo.png" alt="내 티라노를 살려내!" />
          <div className="home-screen__corner">
            <button type="button" className="home-screen__cta" onClick={handleEnterFromHome} disabled={!connected || creating}>
              🦴 방 만들기
            </button>
            {!connected && <p className="home-screen__hint">서버에 연결하는 중…</p>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="desktop-lobby">
      <GodotStage />
      <div className="desktop-lobby__scrim" />

      <div className="desktop-lobby__overlay">
        {showHeader && (
          <header className="lobby-header">
            <img className="lobby-header__logo" src="/images/logo.png" alt="내 티라노를 살려내!" />
            <p className="lobby-header__subtitle">죽은 티라노, 정말 살려드립니다</p>
          </header>
        )}

        {!roomState && !connected && (
          <section className="lobby-connecting">
            <div className="lobby-spinner" />
            <p className="lobby-connecting__title">서버에 연결하는 중…</p>
            <p className="lobby-connecting__hint">잠시만 기다려주세요</p>
          </section>
        )}

        {!roomState && connected && <CreateRoomForm onCreate={handleCreateRoom} creating={creating} error={startError} />}

        {roomState?.roomPhase === "LOBBY" && (
          <section className="lobby-main">
            <h2 className="lobby-room-name">{roomState.roomName}</h2>
            <div className="lobby-code-card">
              <div className="lobby-code-card__code">
                <span className="lobby-code-card__label">방 코드</span>
                <span className="lobby-code-card__value">{roomState.roomCode}</span>
              </div>
              <div className="lobby-code-card__divider" />
              <div className="lobby-code-card__qr">
                {qrDataUrl && <img src={qrDataUrl} alt="입장 QR 코드" width={150} height={150} />}
                <span>📱 스캔해서 입장</span>
              </div>
            </div>

            {startError && (
              <div className="lobby-error-banner lobby-error-banner--inline">
                <span className="lobby-error-banner__icon">⚠</span>
                <span>{startError}</span>
              </div>
            )}

            <LobbyTeams roomState={roomState} />

            <p className="lobby-start__hint">전원 준비되면 자동으로 시작됩니다</p>
          </section>
        )}

        {roomState && roomState.roomPhase === "PLAYING" && <PlayArea roomState={roomState} ephemeral={ephemeral} />}
        {roomState && (roomState.roomPhase === "RESULT" || roomState.roomPhase === "DECORATION") && (
          <ResultView roomState={roomState} gameResult={gameResult} socket={socketRef.current} />
        )}

        <DebugPanel bridge={bridge} />
      </div>
    </main>
  );
}

function CreateRoomForm({
  onCreate,
  creating,
  error,
}: {
  onCreate: (roomName: string, maxPlayersPerTeam: number) => void;
  creating: boolean;
  error: string | null;
}): JSX.Element {
  const [roomName, setRoomName] = useState("");
  const [maxPlayersPerTeam, setMaxPlayersPerTeam] = useState(DEFAULT_MAX_PLAYERS_PER_TEAM);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = roomName.trim();
    if (trimmed.length === 0 || creating) return;
    onCreate(trimmed, maxPlayersPerTeam);
  };

  return (
    <section className="lobby-connecting">
      <form className="lobby-create-card" onSubmit={handleSubmit}>
        <label className="lobby-create-card__field">
          <span>방 이름</span>
          <input
            className="lobby-create-card__input"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value.slice(0, ROOM_NAME_MAX_LENGTH))}
            maxLength={ROOM_NAME_MAX_LENGTH}
            placeholder="방 이름을 입력하세요"
            autoFocus
          />
        </label>
        <label className="lobby-create-card__field">
          <span>팀별 최대 인원</span>
          <input
            className="lobby-create-card__input"
            type="number"
            min={1}
            max={MAX_PLAYERS_PER_TEAM_CAP}
            value={maxPlayersPerTeam}
            onChange={(e) => setMaxPlayersPerTeam(Math.min(MAX_PLAYERS_PER_TEAM_CAP, Math.max(1, Number(e.target.value) || 1)))}
          />
        </label>
        {error && (
          <div className="lobby-error-banner lobby-error-banner--inline">
            <span className="lobby-error-banner__icon">⚠</span>
            <span>{error}</span>
          </div>
        )}
        <button type="submit" className="lobby-start__button" disabled={creating || roomName.trim().length === 0}>
          방 만들기
        </button>
      </form>
    </section>
  );
}

function LobbyTeams({ roomState }: { roomState: RoomState }): JSX.Element {
  const teamIds: TeamId[] = ["A", "B"];
  return (
    <div className="lobby-teams">
      {teamIds.map((teamId) => {
        const players = roomState.players.filter((p) => p.teamId === teamId);
        const emptySlots = Math.max(0, roomState.maxPlayersPerTeam - players.length);
        return (
          <div key={teamId} className={`lobby-team-card lobby-team-card--${teamId.toLowerCase()}`}>
            <div className="lobby-team-card__header">
              <span className="lobby-team-card__name">
                {TEAM_EMBLEM[teamId]} {TEAM_DISPLAY_NAMES[teamId]}
              </span>
              <span className="lobby-team-card__count">
                {players.length}/{roomState.maxPlayersPerTeam}명
              </span>
            </div>
            <ul className="lobby-team-card__list">
              {players.map((p) => (
                <li key={p.id} className={`lobby-team-card__row${p.connected ? "" : " lobby-team-card__row--disconnected"}`}>
                  <span className="lobby-team-card__dot" style={{ background: p.connected ? p.color : "#b8b0a6" }} />
                  <span className="lobby-team-card__name-text">{p.nickname}</span>
                  {!p.connected && <span className="lobby-team-card__status-text">연결 끊김</span>}
                  <span className="lobby-team-card__status-icon">{p.connected ? (p.ready ? "✅" : "⏳") : ""}</span>
                </li>
              ))}
              {Array.from({ length: emptySlots }).map((_, i) => (
                <li key={`empty-${i}`} className="lobby-team-card__row lobby-team-card__row--empty">
                  빈 자리
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function snapshotForTeam(team: RoomState["teams"][TeamId]) {
  return {
    phase: team.phase,
    excavationPoints: team.excavation.points,
    discoveredBoneIds: team.excavation.discoveredBoneIds,
    puzzlePieces: BONE_IDS.map((boneId) => ({
      boneId,
      transform: PUZZLE_TARGET_TRANSFORMS[boneId],
      // 다이노런 평가가 끝났거나 이미 사격/부활 단계면 조립 완료로 표시한다.
      fixed: team.dinoRun.grade !== null || team.phase === "CHARGING" || team.phase === "REVIVED",
    })),
    trex: { position: { x: 0.5, y: 0.5 }, rotationDeg: 0, facing: "RIGHT" as const, poseId: "IDLE" as const },
    energy: team.charging.energy,
    stability: team.charging.stability,
    form: team.charging.form,
  };
}
